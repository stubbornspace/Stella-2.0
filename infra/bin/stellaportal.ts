#!/opt/homebrew/opt/node/bin/node
import * as cdk from "aws-cdk-lib"

import { StellaportalStack } from "../lib/stellaportal-stack"

const app = new cdk.App()

new StellaportalStack(app, "StellaportalStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
