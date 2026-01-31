import * as cdk from "aws-cdk-lib";
import {
  ClientVpnUserBasedAuthentication,
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
import { MutualAuthenticationMode } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const MY_IP = "<your IP>";
const KEY_NAME = "<your key pair name>";
const CLIENT_CERTIFICATE_ARN = "<your client certificate arn>";
const SERVER_CERIFICIATE_ARN = "<your server certificate arn>";
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
      Peer.ipv4(`${MY_IP}/32`),
      Port.tcp(22),
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
      Port.tcp(22),
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

    const clientVpnEndpoint = vpc.addClientVpnEndpoint("Endpoint", {
      cidr: "10.10.0.0/16",
      serverCertificateArn: SERVER_CERIFICIATE_ARN,
      clientCertificateArn: CLIENT_CERTIFICATE_ARN,
      securityGroups: [vpnSG],
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
      },
      splitTunnel: true,
    });

    // Add a 'Name' tag to the endpoint
    cdk.Tags.of(clientVpnEndpoint).add("Name", "DataJammers Endpoint");
  }
}
