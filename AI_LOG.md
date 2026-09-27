# AI_LOG

## How I used AI to build this project

I directed the overall development of this project and used AI as a coding and development assistant.

Most of the implementation was done with Claude (Opus 5.5) during an agentic coding session. I followed an **Orchestrator → Developer → Reviewer → Tester** workflow described in `AGENTS.md`.

The idea was not to blindly accept the generated code. The agents were used for different responsibilities:

* **Orchestrator:** planned the implementation and broke the work into smaller tasks.
* **Developer:** implemented the features based on the plan.
* **Reviewer:** independently reviewed the implementation and looked for security, validation, and design issues.
* **Tester:** tested the application from the outside and looked for cases that normal development testing might miss.

The Reviewer and Tester were not allowed to modify the code. Their role was to find problems and report them, while I made the final decisions about what should be changed.

---

## Where AI made mistakes

AI-generated code was not always correct on the first attempt. Some issues were found during independent review and testing.

### 1. Student name handling

The initial implementation treated names such as `Ravi`, `ravi`, and `RAVI` as different students.

I changed this by introducing a normalised `nameKey` with a unique database constraint. Login now handles differences in case and spacing consistently.

This also helped make the login behaviour more predictable for students and teachers.

### 2. PIN reset did not invalidate existing sessions

The Reviewer found that resetting a student's PIN did not invalidate an already-issued authentication token.

I fixed this by introducing `Student.tokenVersion`. The version is included in the JWT and checked when the token is used. When the PIN is reset, the token version is incremented, which invalidates previously issued tokens.

The authentication guard was also updated to handle deleted accounts correctly instead of returning an unexpected server error.

### 3. Validation and database race conditions

The Reviewer and Tester found some cases where invalid input or simultaneous requests could reach the database and produce `500` errors.

For example, two requests could check whether a name was available at almost the same time and then both attempt to create the record.

I changed the implementation so that the database unique constraint is treated as the final authority. Prisma `P2002` errors are converted into a `409 Conflict` response.

I also strengthened input validation for scheme codes and request bodies to prevent invalid values from reaching the database or business logic.

---

## Changes I made to the original AI-generated plan

The initial planning document was more complicated than the project actually needed.

It proposed things such as:

* a separate `financial-core` package;
* Redux;
* Swagger;
* a four-package monorepo;
* a larger documentation structure.

I decided not to include these because they would add complexity without providing enough value for this MVP.

My goal was to keep the architecture small enough that I could understand and explain every important part of the application.

Another example was the handling of investment units. The original plan suggested keeping unrounded units. After reviewing how units are represented in real investment statements, I changed the implementation to round units down to three decimal places.

These decisions are documented separately in the project decision notes.

---

## Dependency and version decisions

I also did not blindly install the `latest` version of every dependency.

During setup, I checked the available versions and compatibility between the packages. Some latest versions were pre-release or introduced compatibility issues with the rest of the project.

I therefore pinned the project to versions that worked together, including:

* Prisma 7.10
* NestJS 11
* TypeScript 5.9

This helped keep the development environment stable and reproducible.

---

## Where AI helped the most

The biggest advantage of using AI was not just generating code faster.

The most useful part was having independent agents review and test the same implementation from different perspectives.

The Reviewer helped identify security and architecture issues, while the Tester focused more on actual application behaviour and edge cases.

AI was also useful for repetitive verification tasks such as:

* writing unit tests for financial calculations;
* testing concurrent requests;
* checking database transaction behaviour;
* identifying validation edge cases;
* reviewing implementation details.

---

## What I verified myself

I did not rely only on AI-generated output.

I manually verified the important financial calculations and tested the core business logic.

For example:

**Investment**

₹10,000 at a NAV of ₹250:

`₹10,000 / ₹250 = 40 units`

**Redemption**

20 units at a NAV of ₹255:

`20 × ₹255 = ₹5,100`

I also verified the transaction behaviour when two purchases were made simultaneously against a limited cash balance.

Finally, I tested the immutability rules by attempting `UPDATE` and `DELETE` operations and verifying that historical financial records could not be modified.

---

## My approach to AI-assisted development

I treated AI as a development tool rather than as the final authority.

Whenever AI generated an implementation, I reviewed the important parts, tested the behaviour, and made the final decision about whether the approach was appropriate for the project.

# AI_LOG

## How I used AI to build this project

I directed the overall development of this project and used AI as a coding and development assistant.

Most of the implementation was done with Claude (Opus 5.5) during an agentic coding session. I followed an **Orchestrator → Developer → Reviewer → Tester** workflow described in `AGENTS.md`.

The idea was not to blindly accept the generated code. The agents were used for different responsibilities:

* **Orchestrator:** planned the implementation and broke the work into smaller tasks.
* **Developer:** implemented the features based on the plan.
* **Reviewer:** independently reviewed the implementation and looked for security, validation, and design issues.
* **Tester:** tested the application from the outside and looked for cases that normal development testing might miss.

The Reviewer and Tester were not allowed to modify the code. Their role was to find problems and report them, while I made the final decisions about what should be changed.

---

## Where AI made mistakes

AI-generated code was not always correct on the first attempt. Some issues were found during independent review and testing.

### 1. Student name handling

The initial implementation treated names such as `Ravi`, `ravi`, and `RAVI` as different students.

I changed this by introducing a normalised `nameKey` with a unique database constraint. Login now handles differences in case and spacing consistently.

This also helped make the login behaviour more predictable for students and teachers.

### 2. PIN reset did not invalidate existing sessions

The Reviewer found that resetting a student's PIN did not invalidate an already-issued authentication token.

I fixed this by introducing `Student.tokenVersion`. The version is included in the JWT and checked when the token is used. When the PIN is reset, the token version is incremented, which invalidates previously issued tokens.

The authentication guard was also updated to handle deleted accounts correctly instead of returning an unexpected server error.

### 3. Validation and database race conditions

The Reviewer and Tester found some cases where invalid input or simultaneous requests could reach the database and produce `500` errors.

For example, two requests could check whether a name was available at almost the same time and then both attempt to create the record.

I changed the implementation so that the database unique constraint is treated as the final authority. Prisma `P2002` errors are converted into a `409 Conflict` response.

I also strengthened input validation for scheme codes and request bodies to prevent invalid values from reaching the database or business logic.

---

## Changes I made to the original AI-generated plan

The initial planning document was more complicated than the project actually needed.

It proposed things such as:

* a separate `financial-core` package;
* Redux;
* Swagger;
* a four-package monorepo;
* a larger documentation structure.

I decided not to include these because they would add complexity without providing enough value for this MVP.

My goal was to keep the architecture small enough that I could understand and explain every important part of the application.

Another example was the handling of investment units. The original plan suggested keeping unrounded units. After reviewing how units are represented in real investment statements, I changed the implementation to round units down to three decimal places.

These decisions are documented separately in the project decision notes.

---

## Dependency and version decisions

I also did not blindly install the `latest` version of every dependency.

During setup, I checked the available versions and compatibility between the packages. Some latest versions were pre-release or introduced compatibility issues with the rest of the project.

I therefore pinned the project to versions that worked together, including:

* Prisma 7.10
* NestJS 11
* TypeScript 5.9

This helped keep the development environment stable and reproducible.

---

## Where AI helped the most

The biggest advantage of using AI was not just generating code faster.

The most useful part was having independent agents review and test the same implementation from different perspectives.

The Reviewer helped identify security and architecture issues, while the Tester focused more on actual application behaviour and edge cases.

AI was also useful for repetitive verification tasks such as:

* writing unit tests for financial calculations;
* testing concurrent requests;
* checking database transaction behaviour;
* identifying validation edge cases;
* reviewing implementation details.

---

## What I verified myself

I did not rely only on AI-generated output.

I manually verified the important financial calculations and tested the core business logic.

For example:

**Investment**

₹10,000 at a NAV of ₹250:

`₹10,000 / ₹250 = 40 units`

**Redemption**

20 units at a NAV of ₹255:

`20 × ₹255 = ₹5,100`

I also verified the transaction behaviour when two purchases were made simultaneously against a limited cash balance.

Finally, I tested the immutability rules by attempting `UPDATE` and `DELETE` operations and verifying that historical financial records could not be modified.

---

## My approach to AI-assisted development

I treated AI as a development tool rather than as the final authority.

Whenever AI generated an implementation, I reviewed the important parts, tested the behaviour, and made the final decision about whether the approach was appropriate for the project.

The main areas I have focused on understanding before the submission are:

* `apps/api/src/auth`
* `apps/api/src/trading`
* `apps/api/src/finance`

I want to be able to explain the important decisions and code in these areas during the live discussion without depending on AI.
