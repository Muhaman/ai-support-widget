# Acme Cloud: Deployments

> Fictional sample knowledge base for a made-up product ("Acme Cloud"). Not real documentation.

## Why did my deployment fail?
Open the deployment and read the Build log. The most common causes are a missing environment variable, a build command that exits with an error, or an unsupported runtime version. Fix the cause and choose Redeploy.

## How do I roll back a deployment?
Open Deployments, find the last healthy release and choose Promote to production. Rollbacks complete within about a minute and keep your environment variables unchanged.

## How do I add a custom domain?
Under Project settings, choose Domains and enter your domain. Add the CNAME record shown to your DNS provider. Certificates are issued automatically once the record resolves.
