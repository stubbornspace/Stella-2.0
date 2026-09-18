import * as path from "path"

import * as cdk from "aws-cdk-lib"
import * as acm from "aws-cdk-lib/aws-certificatemanager"
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2"
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers"
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations"
import * as cloudfront from "aws-cdk-lib/aws-cloudfront"
import * as origins from "aws-cdk-lib/aws-cloudfront-origins"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as route53 from "aws-cdk-lib/aws-route53"
import * as targets from "aws-cdk-lib/aws-route53-targets"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment"
import * as cr from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"

const allowedGroupName = "stella-poc-users"
const hostedZoneName = "stellaempowers.com"
const siteDomainName = `demo.${hostedZoneName}`

export class StellaportalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: hostedZoneName,
    })

    const siteCertificate = new acm.DnsValidatedCertificate(
      this,
      "SiteCertificate",
      {
        domainName: siteDomainName,
        hostedZone,
        region: "us-east-1",
      }
    )

    const siteBucket = new s3.Bucket(this, "StellaSiteBucket", {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const distribution = new cloudfront.Distribution(
      this,
      "StellaDistribution",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        certificate: siteCertificate,
        defaultRootObject: "index.html",
        domainNames: [siteDomainName],
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
        ],
      }
    )

    new route53.ARecord(this, "SiteAliasRecord", {
      recordName: "demo",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
      zone: hostedZone,
    })

    new route53.AaaaRecord(this, "SiteAliasRecordIpv6", {
      recordName: "demo",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
      zone: hostedZone,
    })

    const siteUrl = `https://${siteDomainName}`
    const cloudFrontUrl = `https://${distribution.domainName}`

    const userPool = new cognito.UserPool(this, "StellaUserPool", {
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: false,
        requireUppercase: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          mutable: true,
          required: true,
        },
      },
    })

    new cognito.CfnUserPoolGroup(this, "StellaPocUsersGroup", {
      description: "Users allowed to access the Stella feedback POC",
      groupName: allowedGroupName,
      precedence: 1,
      userPoolId: userPool.userPoolId,
    })

    const userPoolClient = new cognito.UserPoolClient(
      this,
      "StellaUserPoolClient",
      {
        authFlows: {
          userPassword: true,
          userSrp: true,
        },
        generateSecret: false,
        preventUserExistenceErrors: true,
        userPool,
      }
    )

    const feedbackTable = new dynamodb.Table(this, "FeedbackTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "pk",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      sortKey: {
        name: "sk",
        type: dynamodb.AttributeType.STRING,
      },
    })

    const patientsTable = new dynamodb.Table(this, "PatientsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "patientId",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const sessionsTable = new dynamodb.Table(this, "SessionsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "patientId",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      sortKey: {
        name: "sessionKey",
        type: dynamodb.AttributeType.STRING,
      },
    })

    const analysisTable = new dynamodb.Table(this, "AnalysisTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "patientId",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const feedbackFunction = new lambda.Function(this, "FeedbackFunction", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      environment: {
        TABLE_NAME: feedbackTable.tableName,
      },
      handler: "feedback-handler.handler",
      memorySize: 256,
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(10),
    })

    feedbackTable.grantReadWriteData(feedbackFunction)

    const appFunction = new lambda.Function(this, "AppFunction", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      environment: {
        PATIENTS_TABLE_NAME: patientsTable.tableName,
        SESSIONS_TABLE_NAME: sessionsTable.tableName,
      },
      handler: "app-handler.handler",
      memorySize: 256,
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(15),
    })

    patientsTable.grantReadWriteData(appFunction)
    sessionsTable.grantReadWriteData(appFunction)

    const analysisFunction = new lambda.Function(this, "AnalysisFunction", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      environment: {
        ANALYSIS_TABLE_NAME: analysisTable.tableName,
        BEDROCK_MODEL_ID: "us.amazon.nova-lite-v1:0",
        PATIENTS_TABLE_NAME: patientsTable.tableName,
        SESSIONS_TABLE_NAME: sessionsTable.tableName,
      },
      handler: "analysis-handler.handler",
      memorySize: 512,
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.seconds(30),
    })

    patientsTable.grantReadData(analysisFunction)
    sessionsTable.grantReadData(analysisFunction)
    analysisTable.grantReadWriteData(analysisFunction)
    analysisFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: ["*"],
      })
    )

    const seedFunction = new lambda.Function(this, "SeedFunction", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda")),
      environment: {
        PATIENTS_TABLE_NAME: patientsTable.tableName,
        SESSIONS_TABLE_NAME: sessionsTable.tableName,
      },
      handler: "seed-handler.handler",
      memorySize: 256,
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: cdk.Duration.minutes(2),
    })

    patientsTable.grantReadWriteData(seedFunction)
    sessionsTable.grantReadWriteData(seedFunction)

    const seedProvider = new cr.Provider(this, "SeedProvider", {
      onEventHandler: seedFunction,
    })

    const seedResource = new cdk.CustomResource(this, "SeedResource", {
      properties: {
        seedVersion: "2026-09-17-analysis-poc",
      },
      serviceToken: seedProvider.serviceToken,
    })
    seedResource.node.addDependency(patientsTable)
    seedResource.node.addDependency(sessionsTable)

    const appApi = new apigatewayv2.HttpApi(this, "StellaApi", {
      corsPreflight: {
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
        ],
        allowOrigins: ["*"],
        maxAge: cdk.Duration.hours(1),
      },
    })

    const appAuthorizer = new authorizers.HttpUserPoolAuthorizer(
      "AppAuthorizer",
      userPool,
      {
        userPoolClients: [userPoolClient],
      }
    )

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "FeedbackIntegration",
        feedbackFunction
      ),
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      path: "/feedback",
    })

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "AppIntegration",
        appFunction
      ),
      methods: [apigatewayv2.HttpMethod.GET],
      path: "/dashboard",
    })

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "PatientsIntegration",
        appFunction
      ),
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      path: "/patients",
    })

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "PatientByIdIntegration",
        appFunction
      ),
      methods: [apigatewayv2.HttpMethod.GET],
      path: "/patients/{patientId}",
    })

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "PatientSessionsIntegration",
        appFunction
      ),
      methods: [apigatewayv2.HttpMethod.GET],
      path: "/patients/{patientId}/sessions",
    })

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "ExerciseSessionsIntegration",
        appFunction
      ),
      methods: [apigatewayv2.HttpMethod.GET],
      path: "/patients/{patientId}/exercises/{exerciseType}/sessions",
    })

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "SaveSessionIntegration",
        appFunction
      ),
      methods: [apigatewayv2.HttpMethod.POST],
      path: "/sessions",
    })

    appApi.addRoutes({
      authorizer: appAuthorizer,
      integration: new integrations.HttpLambdaIntegration(
        "AnalysisIntegration",
        analysisFunction
      ),
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      path: "/patients/{patientId}/analysis",
    })

    new s3deploy.BucketDeployment(this, "DeployStellaSite", {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      prune: true,
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../stella/dist")),
        s3deploy.Source.jsonData("runtime-config.json", {
          api: {
            baseUrl: appApi.apiEndpoint,
          },
          auth: {
            enabled: true,
            region: this.region,
            requiredGroup: allowedGroupName,
            userPoolClientId: userPoolClient.userPoolClientId,
            userPoolId: userPool.userPoolId,
          },
        }),
      ],
    })

    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: cloudFrontUrl,
    })

    new cdk.CfnOutput(this, "DemoUrl", {
      value: siteUrl,
    })

    new cdk.CfnOutput(this, "ApiBaseUrl", {
      value: appApi.apiEndpoint,
    })

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    })

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    })
    new cdk.CfnOutput(this, "AllowedUserGroup", {
      value: allowedGroupName,
    })

    new cdk.CfnOutput(this, "PatientsTableName", {
      value: patientsTable.tableName,
    })

    new cdk.CfnOutput(this, "SessionsTableName", {
      value: sessionsTable.tableName,
    })

    new cdk.CfnOutput(this, "AnalysisTableName", {
      value: analysisTable.tableName,
    })
  }
}
