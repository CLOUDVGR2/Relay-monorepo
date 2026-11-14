# Relay AI Assistant — User and Operator Guide

## 1. What the assistant does

The Relay AI capability provides document-backed answers, selected conversation analysis, incident workflows and multi-agent task execution. The browser and mobile clients present the answer experience; authenticated API services enforce access and call the internal Python AI service.

## 2. Asking document questions

Use the Knowledge Base when the answer should be based on indexed Relay documents. Ask a specific question and include relevant product, service, date or process context. The service retrieves passages using semantic and keyword search, then generates an answer with citations. The client displays the answer and uploader attribution; it does not expose low-level retrieval diagnostics in the normal user experience.

A good question is narrow and explicit:

- “What is the escalation procedure for the billing API?”
- “Which weekday does the runbook specify for maintenance?”
- “What is the cancellation window in the uploaded policy?”

The answer may abstain if there is no relevant evidence or no valid supporting citation. When a question has multiple possible meanings, specify the intended category—for example business closing time versus class start time.

## 3. Shared knowledge visibility

In the current implementation, authenticated users can search and ask questions across the indexed Knowledge Base even when another user uploaded the document. Document upload, document listing and direct document lookup remain scoped to the uploader's tenant. Answers include uploader attribution where the source can be resolved to a user profile.

This is a shared corpus, not a private document vault. Do not upload confidential, regulated, customer-segregated or otherwise restricted content unless its sharing is explicitly authorized by the applicable organization policy. Uploader attribution tells the reader who uploaded a source; it does not make the passage private.

## 4. Understanding answers

- A generated answer is not guaranteed to be correct merely because it includes a citation.
- A citation confirms that a passage was retrieved; users should still evaluate whether the passage supports the claim.
- If the source is missing, outdated or ambiguous, verify it with the document owner.
- A deterministic operating-hours rule handles a narrow weekday closing-time question when explicit hours rows exist. Other questions continue through the configured model provider.
- Generated content should not be treated as legal, medical, financial or safety-critical advice without qualified review.

## 5. Conversation analysis

The internal analysis capability accepts a bounded transcript and returns a structured summary, decisions and action items. Treat extracted owners and due dates as draft information; confirm them with participants before creating commitments.

## 6. Incident intelligence

The incident workflow separates incident creation, investigation, approval, execution and recovery. Creating an incident does not execute remediation. Review evidence and the proposed action, confirm authorization and approval, and verify post-action recovery. The currently implemented scenario catalog is limited; do not assume arbitrary infrastructure remediation is supported.

## 7. Multi-agent tasks

A submitted multi-agent task is asynchronous. The initial response represents accepted/current task state, not a completed answer. Follow task status and progress, and handle failed tasks explicitly. Task prompts and generated results should be treated as untrusted input/output.

## 8. Data handling guidance

- Do not submit credentials, secrets, personal data or restricted business documents unless the deployment's data policy permits the configured provider and shared corpus.
- Avoid placing secrets in conversation transcripts or document content.
- Verify model/provider processing and retention terms for the target environment.
- Report incorrect answers with the question, expected evidence, citation title and observed result—never include bearer tokens or cookies.
- Ask a document owner to update or replace a stale source; generated answers do not correct source material.

## 9. Reporting a problem

Include the client (web or mobile), approximate timestamp/time zone, exact question, answer, document title/uploader shown, and whether the source was expected to contain the fact. Do not include authorization headers, internal service tokens, database IDs beyond what support specifically requests, or raw customer content in public tickets.
