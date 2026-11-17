#!/bin/bash
set -e

env=$1
project=polaris
subDomain=polaris
domain=celestialstudio.net

echo ====================================================================================
echo env: $env
echo project: $project
echo domain: $subDomain.$domain
echo ====================================================================================

echo deploy backend AWS...
cd ./backend
npm i
npm run pre:deploy
aws cloudformation package --template-file aws/cloudformation/template.yaml --output-template-file packaged.yaml --s3-bucket y-cf-midway-ap-east-2
aws cloudformation deploy --template-file packaged.yaml --stack-name $project-$env-stack --parameter-overrides TargetEnvr=$env Project=$project SubDomain=$subDomain Domain=$domain --no-fail-on-empty-changeset --s3-bucket y-cf-midway-ap-east-2 --capabilities CAPABILITY_NAMED_IAM
echo ====================================================================================

# The backend goes first on purpose: a webapp calling a route the deployed
# backend does not have yet is the less bad failure of the two orderings.
echo deploy webapp to S3...
cd ../webapp
npm i
# next dev and next build share .next but produce incompatible output, because
# next.config.ts only sets output:'export' when NODE_ENV=production. A local dev
# run therefore leaves artifacts that make this build fail. out is cleared too,
# so pages deleted since the last release are not re-synced from a stale export.
rm -rf .next out
npm run build
# Everything is uploaded uncacheable, matching the TTL-0 CloudFront behavior, so
# no invalidation is needed. --delete prunes pages removed since the last
# release. When /_next/static/* gets its own long-TTL behavior, its immutable
# headers have to be set here in a second pass.
aws s3 sync ./out s3://$project-$env-y --delete --cache-control no-cache
echo ====================================================================================
