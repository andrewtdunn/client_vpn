import * as cdk from "aws-cdk-lib";
import {
  Instance,
  IpAddresses,
  Peer,
  Port,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
  UserData,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

const MY_IP = process.env.MY_IP;
const KEY_NAME = process.env.KEY_NAME;
const CLOUD_CIDR = "10.0.0.0/16";
const SSH_PORT = 22;
const INSTANCE_SIZE_TYPE = "t3.micro";

export class ClientVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "DemoVPC", {
      ipAddresses: IpAddresses.cidr(CLOUD_CIDR),
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
      instanceType: new cdk.aws_ec2.InstanceType(INSTANCE_SIZE_TYPE),
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
      Peer.ipv4(`${MY_IP}/32`),
      Port.tcp(SSH_PORT),
      "Allow SSH traffic from my ip only",
    );

    // Add a 'Name' tag to the instance
    cdk.Tags.of(jumpbox).add("Name", "DataJammers Jumpbox");

    const vpnSG = new SecurityGroup(this, "ClientVpnSG", {
      securityGroupName: "ClientVpnSG",
      vpc,
      description: "Security Group for Client VPN",
      allowAllOutbound: true,
    });

    const appSG = new SecurityGroup(this, "AppSG", {
      securityGroupName: "AppSG",
      vpc,
      description: "Security Group for App Server",
      allowAllOutbound: true,
    });

    appSG.addIngressRule(
      jumpboxSG,
      Port.tcp(SSH_PORT),
      "Allow SSH traffic from jumpbox",
    );

    appSG.addIngressRule(
      jumpboxSG,
      Port.tcp(80),
      "Allow http traffic from jumpbox",
    );

    appSG.addIngressRule(
      vpnSG,
      Port.tcp(80),
      "Allow http traffic from VPN clients",
    );

    const userData = UserData.forLinux();

    userData.addCommands(
      "sudo su",
      "yum update -y",
      "yum install -y httpd.x86_64",
      "systemctl start httpd.service",
      "systemctl enable httpd.service",
      'TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")',
      'PRIVATE_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)',
      'echo "<h1>Application Private IP address is: $PRIVATE_IP</h1>" >> /var/www/html/index.html',
    );

    const appServer = new Instance(this, "ApplicationServer", {
      instanceType: new cdk.aws_ec2.InstanceType("t3.micro"),
      machineImage: cdk.aws_ec2.MachineImage.latestAmazonLinux2(),
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      keyName: KEY_NAME,
      securityGroup: appSG,
      userData,
    });

    // Add a 'Name' tag to the instance
    cdk.Tags.of(appServer).add("Name", "DataJammers Application");
  }
}
