# Relay AI Assistant User Guide

## Purpose

Relay's AI capabilities provide document-grounded question answering, conversation analysis, incident investigation assistance, and coordinated multi-agent task execution.

## Document questions

Users can submit documents into their tenant workspace and ask natural-language questions about the ingested material. The retrieval workflow searches tenant-scoped chunks and returns answer content with source citations. Citations identify the evidence used to construct the answer; they should be reviewed when decisions depend on the result.

## Conversation analysis

Conversation analysis transforms supplied transcript content into structured outputs such as concise summaries, decisions, and follow-up actions. The result is an analysis artifact, not a replacement for the original conversation record.

## Incident intelligence

Incident workflows organize evidence and investigation results. The workflow distinguishes investigation from approval and execution so that proposed remediation is reviewed before an action is performed.

## Multi-agent tasks

Multi-agent tasks are submitted as durable work items. The client can retrieve task status, progress phases, results, and completion timestamps independently from the worker process.

## Responsible use

AI-generated content is decision support. Verify citations, confirm operational facts against authoritative systems, and require human review for consequential actions. Do not submit secrets or personal data unless the deployment's data handling policy explicitly permits it.
