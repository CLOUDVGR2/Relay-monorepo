#!/usr/bin/env python3
"""Render the AWS Kubernetes overlay locally without deploying anything."""

import argparse
import ipaddress
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
OVERLAY = ROOT / "infrastructure/kubernetes/overlays/aws"
TERRAFORM = ROOT / "infrastructure/aws/terraform"


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_env(path):
    values = {}
    if not path.is_file():
        fail(f"Configuration file not found: {path}")

    for line_number, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            fail(f"Invalid setting on line {line_number}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if value[:1] in ("'", '"') and value[-1:] == value[:1]:
            value = value[1:-1]
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            fail(f"Invalid setting name on line {line_number}: {key}")
        values[key] = value
    return values


def replace_once(path, old, new):
    content = path.read_text()
    count = content.count(old)
    if count != 1:
        fail(f"Expected exactly one occurrence of {old!r} in {path}; found {count}")
    path.write_text(content.replace(old, new, 1))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env",
        type=Path,
        default=OVERLAY / ".env.aws",
        help="Private deployment settings file (default: AWS overlay/.env.aws)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/tmp/relay-aws-rendered.yaml"),
        help="Rendered manifest output path",
    )
    args = parser.parse_args()

    env_path = args.env if args.env.is_absolute() else ROOT / args.env
    values = read_env(env_path)

    required = (
        "AWS_REGION",
        "AWS_ACCOUNT_ID",
        "ECR_IMAGE_TAG",
        "APP_DOMAIN",
        "ACM_CERTIFICATE_ARN",
        "K8S_NAMESPACE",
        "EKS_CLUSTER_NAME",
        "AI_ENDPOINT_URL",
    )
    missing = [key for key in required if not values.get(key)]
    if missing:
        fail("Missing settings: " + ", ".join(missing))

    for key in required:
        if "REPLACE_WITH_" in values[key]:
            fail(f"{key} still contains an example placeholder")

    if not re.fullmatch(r"\d{12}", values["AWS_ACCOUNT_ID"]):
        fail("AWS_ACCOUNT_ID must contain exactly 12 digits")
    if not re.fullmatch(r"[a-z0-9-]+", values["AWS_REGION"]):
        fail("AWS_REGION has an invalid format")
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}", values["ECR_IMAGE_TAG"]):
        fail("ECR_IMAGE_TAG is not a valid container image tag")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", values["K8S_NAMESPACE"]):
        fail("K8S_NAMESPACE must be a valid Kubernetes namespace")
    if not re.fullmatch(r"[A-Za-z0-9.-]+", values["APP_DOMAIN"]):
        fail("APP_DOMAIN must be a hostname without a scheme or path")
    if values["APP_DOMAIN"] == "relay.example.com":
        fail("APP_DOMAIN must not use the example hostname")
    if not values["ACM_CERTIFICATE_ARN"].startswith("arn:"):
        fail("ACM_CERTIFICATE_ARN must be a complete ARN")

    ai_url = urlparse(values["AI_ENDPOINT_URL"])
    if ai_url.scheme not in ("http", "https") or not ai_url.hostname:
        fail("AI_ENDPOINT_URL must be a complete http:// or https:// URL")

    if ai_url.username or ai_url.password:
        fail("AI_ENDPOINT_URL must not contain embedded credentials")

    if ai_url.path not in ("", "/") or ai_url.query or ai_url.fragment:
        fail("AI_ENDPOINT_URL must be a base URL without an API path, query, or fragment")

    ai_hostname = ai_url.hostname.lower()
    if (
        ai_hostname in ("localhost", "host.docker.internal")
        or ai_hostname.endswith(".localhost")
    ):
        fail("AI_ENDPOINT_URL must not point to a local-only hostname")

    try:
        ai_ip = ipaddress.ip_address(ai_hostname)
    except ValueError:
        ai_ip = None

    if ai_ip and (ai_ip.is_loopback or ai_ip.is_unspecified or ai_ip.is_link_local):
        fail("AI_ENDPOINT_URL must not use a loopback, unspecified, or link-local IP")

    security_group = values.get("ALB_SECURITY_GROUP_ID", "").strip()
    if security_group and not re.fullmatch(r"sg-[0-9a-fA-F]{8,}", security_group):
        fail("ALB_SECURITY_GROUP_ID must be a valid security-group ID")

    if not security_group:
        result = subprocess.run(
            ["terraform", f"-chdir={TERRAFORM}", "output", "-raw", "alb_security_group_id"],
            text=True,
            capture_output=True,
        )
        candidate = result.stdout.strip()
        if result.returncode == 0 and re.fullmatch(r"sg-[0-9a-fA-F]{8,}", candidate):
            security_group = candidate

    args.output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="relay-aws-render-") as temporary:
        render_root = Path(temporary) / "aws"
        shutil.copytree(OVERLAY, render_root)

        # Apply the application hostname consistently to rendered manifests.
        for manifest in render_root.rglob("*"):
            if not manifest.is_file() or manifest.suffix not in (".yaml", ".yml"):
                continue
            manifest_content = manifest.read_text()
            if "relay.example.com" in manifest_content:
                manifest.write_text(
                    manifest_content.replace("relay.example.com", values["APP_DOMAIN"])
                )

        kustomization = render_root / "kustomization.yaml"
        ingress = render_root / "ingress.yaml"
        ai_config = render_root / "resources/python-ai/configmap.yaml"

        content = kustomization.read_text()
        for old, new in (
            ("AWS_ACCOUNT_ID", values["AWS_ACCOUNT_ID"]),
            ("AWS_REGION", values["AWS_REGION"]),
            ("REPLACE_WITH_IMAGE_TAG", values["ECR_IMAGE_TAG"]),
        ):
            if old not in content:
                fail(f"Expected placeholder {old!r} not found in kustomization.yaml")
            content = content.replace(old, new)
        replace_count = content.count("namespace: relay")
        if replace_count != 1:
            fail(f"Expected one namespace declaration in kustomization.yaml; found {replace_count}")
        content = content.replace(
            "namespace: relay", f"namespace: {values['K8S_NAMESPACE']}", 1
        )
        kustomization.write_text(content)

        content = ingress.read_text()
        for old, new in (
            ("REPLACE_WITH_ACM_CERTIFICATE_ARN", values["ACM_CERTIFICATE_ARN"]),
            ("namespace: relay", f"namespace: {values['K8S_NAMESPACE']}"),
        ):
            if old not in content:
                fail(f"Expected ingress setting {old!r} was not found")
            content = content.replace(old, new)
        if security_group:
            anchor = (
                "    alb.ingress.kubernetes.io/certificate-arn: "
                f"{values['ACM_CERTIFICATE_ARN']}\n"
            )
            if content.count(anchor) != 1:
                fail("Could not safely locate the Ingress certificate annotation")
            content = content.replace(
                anchor,
                anchor
                + f"    alb.ingress.kubernetes.io/security-groups: {security_group}\n"
                + '    alb.ingress.kubernetes.io/manage-backend-security-group-rules: "true"\n',
                1,
            )
        ingress.write_text(content)

        content = ai_config.read_text()
        if "host.docker.internal:11434" not in content:
            fail("Expected local AI endpoint was not found in the Python AI ConfigMap")
        content = content.replace(
            "http://host.docker.internal:11434", values["AI_ENDPOINT_URL"].rstrip("/")
        )
        content = content.replace("relay.example.com", values["APP_DOMAIN"])
        ai_config.write_text(content)

        result = subprocess.run(
            ["kubectl", "kustomize", str(render_root)],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if result.returncode:
            fail("Kustomize rendering failed:\n" + result.stderr)

        forbidden = (
            "REPLACE_WITH_",
            "AWS_ACCOUNT_ID",
            "AWS_REGION",
            "relay.example.com",
            "host.docker.internal",
        )
        remaining = [token for token in forbidden if token in result.stdout]
        if remaining:
            fail("Rendered manifests still contain placeholders: " + ", ".join(remaining))

        args.output.write_text(result.stdout)

    print("AWS overlay rendered successfully.")
    print(f"Output: {args.output}")
    print(f"Namespace: {values['K8S_NAMESPACE']}")
    print(f"Image tag: {values['ECR_IMAGE_TAG']}")
    print(
        "ALB security group: " + security_group
        if security_group
        else "ALB security group: not configured; controller default behavior retained"
    )
    print("No Kubernetes resources were applied.")
    print("No AWS resources were created.")


if __name__ == "__main__":
    main()
