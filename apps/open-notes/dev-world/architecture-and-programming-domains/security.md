# Security:

## Build vs Buy:

### Build: You are responsible for encryption, database security, and keeping up with the latest hacking vulnerabilities.

### Buy: You buy a service that is managed by world-class security engineers.

| Framework             | Description                                                         | Application                    | Constraint                                    | Tradeoff                     |
| --------------------- | ------------------------------------------------------------------- | ------------------------------ | --------------------------------------------- | ---------------------------- |
| Auth0/Okta            | Identity as a Service that handles logins, MFA and password resets. |                                | Implementation Speed.                         | Buy vs Build                 |
| Keycloak              | Open-source identity manager that is self hosted.                   | Full control identity manager. | Scale/longevity                               | You are responsible for xyz. |
| JWT (JSON Web Tokens) | Stateless, Standard format for sharing identity.                    |                                | Clarity - Opinionated about being "stateless" |                              |
