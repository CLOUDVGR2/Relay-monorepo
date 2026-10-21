# Relay AI Assistant — User Guide

## Purpose
The Relay AI Assistant answers questions using documents indexed for the authenticated Relay account. It uses retrieval-augmented generation (RAG) to find relevant document chunks and returns an answer with source references when available.

## Asking Questions
- Open the authenticated Relay application and navigate to `/ai`.
- Enter a question about the available indexed documentation.
- Submit the question and review the answer.
- Open the Sources section to inspect the source title, source URI, chunk index, and character offsets when provided.
- Start a new conversation to clear the current page's displayed conversation.

## Suggested Uses
- Ask for facts explicitly documented in indexed sources.
- Ask for summaries of available documentation.
- Ask for troubleshooting steps described by the indexed material.
- Ask follow-up questions with precise terminology when a result is too broad.

## Evidence and Limitations
Answers depend on the documents available to the current account and the relevance of retrieved chunks. A missing answer does not prove that information does not exist elsewhere. Verify important answers against the original source.

When evidence is insufficient, the assistant may state that it cannot answer reliably. An answer without citations should not be treated as independently verified.

## Privacy
The UI describes the assistant as private to the account. The backend's Python document routes scope document operations by the authenticated Relay user ID. Treat these as documented design behavior; confirm cross-user isolation with security tests rather than relying on UI wording alone.
