#!/bin/bash
set -e

env=$1
project=polaris

echo ====================================================================================
echo env: $env
echo project: $project
echo ====================================================================================

echo deploy backend AWS...
npm i
npm run pre:deploy
aws cloudformation package --template-file aws/cloudformation/template.yaml --output-template-file packaged.yaml --s3-bucket y-cf-midway-ap-east-2
aws cloudformation deploy --template-file packaged.yaml --stack-name $project-$env-stack --parameter-overrides TargetEnvr=$env Project=$project --no-fail-on-empty-changeset --s3-bucket y-cf-midway-ap-east-2 --capabilities CAPABILITY_NAMED_IAM
echo ====================================================================================
