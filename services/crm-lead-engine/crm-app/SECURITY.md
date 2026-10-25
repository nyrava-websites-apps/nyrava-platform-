# Security policy

## Supported version

Security reports are accepted for the current version of Nyrava CRM App. The repository does not yet publish a formal release cadence or a public vulnerability disclosure program.

## Report a vulnerability

Do not report suspected vulnerabilities in a public issue. Contact the repository owner privately through GitHub's private vulnerability reporting feature, if it is enabled, or use the private contact channel provided with your software agreement. Include:

- the affected version or commit;
- a clear description and steps to reproduce;
- the impact you observed and any suggested mitigation.

Do not include real customer information, passwords, session cookies, or production secrets. Allow the maintainer reasonable time to investigate and coordinate a fix before public disclosure.

## Deployment notes

- Do not expose the demo profile or its sample credentials to the public internet.
- Use HTTPS, secure hosting, and a secret manager for database and SMTP credentials.
- Restrict database network access to the application host and protect backups.
- Review workspace and role authorization before connecting another product.
