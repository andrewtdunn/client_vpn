import * as cdk from "aws-cdk-lib";
import {
  Instance,
  IpAddresses,
  Peer,
  Port,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const MY_IP = "XXX.XXX.XXX.XXX";
const KEY_NAME = "datajammers_key.pem";

export class ClientVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "DemoVPC", {
      ipAddresses: IpAddresses.cidr("10.0.0.0/16"),
      vpcName: "DemoVPC",
    });

    const jumpboxSG = new SecurityGroup(this, "JumpBoxSG", {
      securityGroupName: "JumpBoxSG",
      vpc,
      description: "Security Group for JumpBox",
      allowAllOutbound: true,
    });

    const publicSubnets: SubnetSelection = {
      subnetType: SubnetType.PUBLIC,
    };

    const jumpbox = new Instance(this, "JumpBox", {
      instanceType: new cdk.aws_ec2.InstanceType("t3.micro"),
      machineImage: cdk.aws_ec2.MachineImage.latestAmazonLinux2(),
      vpc,
      vpcSubnets: publicSubnets,
      keyName: KEY_NAME,
      securityGroup: jumpboxSG,
    });

    jumpboxSG.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      "Allow HTTPS traffic",
    );
    jumpboxSG.addEgressRule(Peer.anyIpv4(), Port.tcp(80), "Allow HTTP traffic");
    jumpboxSG.addEgressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      "Allow HTTPS traffic",
    );

    jumpboxSG.addIngressRule(
      Peer.ipv4(MY_IP),
      Port.tcp(22),
      "Allow SSH traffic from my ip only",
    );

    // Add a 'Name' tag to the instance
    cdk.Tags.of(jumpbox).add("Name", "Jumpbox");
  }
}
