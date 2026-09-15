# POC Brief

## Overview

This proof of concept (POC) demonstrates an integrated hardware and software system for delivering and tracking keyboard-based therapeutic exercises.

The hardware consists of a custom physical keyboard with 30 programmable keys. Each key can display letters and provide visual feedback using different colors or flashing patterns. The device also includes a speaker for audio prompts. The keys and speaker are connected to a Raspberry Pi, which acts as the local controller for exercise execution.

The software consists of two main parts:

- A React-based application running on the Raspberry Pi through a local web server.
- An AWS-based backend used for user management and storage of exercise data.

The backend includes:

- Amazon Cognito for user management
- An API with AWS Lambda for application logic
- DynamoDB for storing exercise and session data

Each exercise can be configured using parameters such as word length and number of words. When a session starts, those parameters are used to generate a script on the Raspberry Pi that drives the keyboard exercise. During the exercise, the keyboard records key presses and timestamps. This data is then used to determine whether the keys were pressed in the correct order. At the end of the exercise, the captured data is processed to generate a results view in the application, and the session data is also sent to the backend for storage and later analysis.

For the POC, the application provides a simple interface to:

- Create users under clinics
- Run configurable exercises
- Capture exercise history for each user
- Review session results

## Comparison to Functional Requirements

Based on the functional requirements described, the POC covers the core end-to-end concept and validates the main system architecture.

### Areas Covered by the POC

- Physical keyboard with 30 programmable keys
- Visual feedback through lit or flashing colored keys
- Speaker-based audio prompts
- Raspberry Pi integration for local control of the hardware
- Local application interface running on the Raspberry Pi
- AWS backend for user and session data management
- User management through Cognito
- Serverless backend logic using API and Lambda
- Data persistence using DynamoDB
- Configurable exercise setup using parameters such as word length and number of words
- Generation of a session script on the Raspberry Pi at exercise start
- Recording of key presses and timestamps during exercise execution
- Validation of whether keys were pressed in the expected order
- Results display in the application at the end of an exercise
- Storage of session data for later analysis
- Basic clinic-based user organization
- Exercise history tracking per user

### Summary

The POC successfully demonstrates the core workflow:

1. A clinician or operator configures an exercise.
2. The Raspberry Pi launches the exercise on the keyboard.
3. The keyboard captures interaction data during the session.
4. The application presents a results view at the end of the session.
5. The session data is sent to the backend for storage and future analysis.

## What Is Not Covered by the POC

The POC is intentionally limited in scope and does not yet represent a complete production-ready solution. The following areas are not fully covered:

- Full production-grade clinic, user, and role administration
- A complete library of finalized exercise types and flows
- Full validation of all hardware behaviors across every exercise mode
- Advanced reporting and analytics for clinicians or administrators
- Longitudinal trend analysis and richer performance dashboards
- Production hardening for security, monitoring, reliability, and scalability
- Broader workflow features such as exports, audit trails, and operational support tooling
- Full implementation of every requirement that may exist in the functional requirements document
