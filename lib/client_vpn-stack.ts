import * as cdk from "aws-cdk-lib";
import { IpAddresses, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ClientVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const CLOUD_CIDR = "10.0.0.0/16";

    const vpc = new Vpc(this, "DemoVPC", {
      ipAddresses: IpAddresses.cidr(CLOUD_CIDR),
      vpcName: "DemoVPC",
    });
  }
}
