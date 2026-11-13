package main

import (
	"crypto/tls"
	"net/http"
	"net/netip"
	"testing"
)

func TestParseTrustedProxyCIDRs(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    int
		wantErr bool
	}{
		{name: "empty defaults to no trusted proxies", input: "", want: 0},
		{name: "IPv4 and IPv6", input: "10.0.0.0/8, 2001:db8::/32", want: 2},
		{name: "invalid CIDR", input: "not-a-cidr", wantErr: true},
		{name: "empty entry", input: "10.0.0.0/8,,192.168.0.0/16", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseTrustedProxyCIDRs(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr = %v", err, tt.wantErr)
			}
			if err == nil && len(got) != tt.want {
				t.Fatalf("got %d prefixes, want %d", len(got), tt.want)
			}
		})
	}
}

func TestForwardingMetadataUntrustedPeerIgnoresHeaders(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "http://gateway.test/", nil)
	req.RemoteAddr = "192.0.2.10:4567"
	req.Header.Set("X-Forwarded-For", "203.0.113.99")
	req.Header.Set("X-Forwarded-Proto", "https")

	prefixes := []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
	}

	ip, proto := forwardingMetadata(req, prefixes)

	if ip != "192.0.2.10" {
		t.Fatalf("client IP = %q, want immediate peer IP", ip)
	}
	if proto != "http" {
		t.Fatalf("protocol = %q, want http", proto)
	}
}

func TestForwardingMetadataTrustedPeerUsesRightmostValidIP(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "http://gateway.test/", nil)
	req.RemoteAddr = "10.1.2.3:4567"
	req.Header.Set("X-Forwarded-For", "198.51.100.10, 203.0.113.7")
	req.Header.Set("X-Forwarded-Proto", "https")

	prefixes := []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
	}

	ip, proto := forwardingMetadata(req, prefixes)

	if ip != "203.0.113.7" {
		t.Fatalf("client IP = %q, want rightmost forwarded IP", ip)
	}
	if proto != "https" {
		t.Fatalf("protocol = %q, want https", proto)
	}
}

func TestForwardingMetadataTrustedPeerHandlesMalformedHeaders(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "http://gateway.test/", nil)
	req.RemoteAddr = "10.1.2.3:4567"
	req.Header.Set("X-Forwarded-For", "198.51.100.10, malformed")
	req.Header.Set("X-Forwarded-Proto", "javascript")

	prefixes := []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
	}

	ip, proto := forwardingMetadata(req, prefixes)

	if ip != "198.51.100.10" {
		t.Fatalf("client IP = %q, want rightmost valid forwarded IP", ip)
	}
	if proto != "http" {
		t.Fatalf("protocol = %q, want safe connection fallback", proto)
	}
}

func TestForwardingMetadataTrustedPeerFallsBackToTLSForInvalidProto(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "http://gateway.test/", nil)
	req.RemoteAddr = "10.1.2.3:4567"
	req.TLS = &tls.ConnectionState{}
	req.Header.Set("X-Forwarded-Proto", "ftp")

	prefixes := []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
	}

	_, proto := forwardingMetadata(req, prefixes)

	if proto != "https" {
		t.Fatalf("protocol = %q, want https from TLS connection", proto)
	}
}

func TestParseTrustedProxyCIDRsNormalizesIPv4MappedPrefix(t *testing.T) {
	prefixes, err := parseTrustedProxyCIDRs("::ffff:10.1.2.3/120")
	if err != nil {
		t.Fatalf("parseTrustedProxyCIDRs() error = %v", err)
	}

	if len(prefixes) != 1 {
		t.Fatalf("got %d prefixes, want 1", len(prefixes))
	}

	want := netip.MustParsePrefix("10.1.2.0/24")
	if prefixes[0] != want {
		t.Fatalf("prefix = %v, want %v", prefixes[0], want)
	}

	if !trustedProxy(netip.MustParseAddr("10.1.2.99"), prefixes) {
		t.Fatal("normalized prefix should trust an IPv4 peer inside the range")
	}
}

func TestParseTrustedProxyCIDRsRejectsBroadMappedPrefix(t *testing.T) {
	_, err := parseTrustedProxyCIDRs("::ffff:10.1.2.3/95")
	if err == nil {
		t.Fatal("expected mapped IPv6 prefix shorter than /96 to be rejected")
	}
}
