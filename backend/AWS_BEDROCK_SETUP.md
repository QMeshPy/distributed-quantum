# AWS Bedrock Setup Guide

Complete guide to setting up AWS Bedrock for Claude 3.5 Sonnet access in the Quantum Backend project.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Create AWS IAM User](#step-1-create-aws-iam-user)
4. [Step 2: Configure Required Permissions](#step-2-configure-required-permissions)
5. [Step 3: Generate Access Keys](#step-3-generate-access-keys)
6. [Step 4: Enable Bedrock Model Access](#step-4-enable-bedrock-model-access)
7. [Step 5: Configure Environment Variables](#step-5-configure-environment-variables)
8. [Step 6: Test Connection](#step-6-test-connection)
9. [Troubleshooting](#troubleshooting)
10. [Cost Estimates](#cost-estimates)

---

## Overview

AWS Bedrock provides serverless access to Claude 3.5 Sonnet for:
- **Phase 3**: AI Research Agents (proposal analysis, coalition formation)
- **Phase 4**: Auto-fragmentation (breaking research proposals into tasks)

**Model**: `anthropic.claude-3-5-sonnet-20241022-v2:0`

**Why Bedrock?**
- Pay-per-use pricing (no monthly fees)
- Built-in AWS security and compliance
- No separate Anthropic API key needed
- Scales automatically with demand

---

## Prerequisites

- AWS Account (create at https://aws.amazon.com)
- Basic familiarity with AWS Console
- Admin access to create IAM users (or contact your AWS admin)

---

## Step 1: Create AWS IAM User

### 1.1 Navigate to IAM Console

1. Log into AWS Console: https://console.aws.amazon.com
2. Search for "IAM" in the top search bar
3. Click on "IAM" (Identity and Access Management)

### 1.2 Create New User

1. In the left sidebar, click **Users**
2. Click **Create user** button
3. Enter user details:
   - **User name**: `quantum-backend-bedrock`
   - **Provide user access to AWS Management Console**: UNCHECK (we only need programmatic access)
4. Click **Next**

---

## Step 2: Configure Required Permissions

### 2.1 Attach Policy Directly

On the "Set permissions" page:

1. Select **Attach policies directly**
2. Search for `AmazonBedrockFullAccess`
3. Check the box next to **AmazonBedrockFullAccess**
4. Click **Next**

### 2.2 Review and Create

1. Review the user details:
   - User name: `quantum-backend-bedrock`
   - Permissions: `AmazonBedrockFullAccess`
2. Click **Create user**

### 2.3 Custom Policy (Alternative - More Restrictive)

If your organization requires least-privilege access, use this custom policy instead:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvokeModel",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"
      ]
    }
  ]
}
```

To use custom policy:
1. Select **Attach policies directly**
2. Click **Create policy** (opens new tab)
3. Click **JSON** tab
4. Paste the policy above
5. Click **Next**, name it `BedrockClaudeInvokeOnly`
6. Return to user creation tab and attach the new policy

---

## Step 3: Generate Access Keys

### 3.1 Navigate to User Security Credentials

1. After creating the user, click on the user name `quantum-backend-bedrock`
2. Click the **Security credentials** tab
3. Scroll down to **Access keys** section
4. Click **Create access key**

### 3.2 Select Use Case

1. Select **Application running outside AWS**
2. Check the confirmation box at the bottom
3. Click **Next**

### 3.3 Add Description Tag (Optional)

1. Description: `Quantum Backend Claude API Access`
2. Click **Create access key**

### 3.4 Download Credentials

**CRITICAL**: This is your ONLY chance to see the secret key!

1. You'll see:
   - **Access key ID**: Starts with `AKIA...`
   - **Secret access key**: Long random string
2. Click **Download .csv file** (recommended)
3. OR copy both values to a secure location immediately

**Security Best Practices**:
- NEVER commit these keys to git
- Store in password manager or AWS Secrets Manager
- Rotate keys every 90 days

---

## Step 4: Enable Bedrock Model Access

AWS requires explicit permission to use Claude models.

### 4.1 Navigate to Bedrock Console

1. Search for "Bedrock" in AWS Console
2. Click **Amazon Bedrock**
3. In left sidebar, click **Model access** (under "Bedrock configurations")

### 4.2 Request Model Access

1. Find **Anthropic** in the provider list
2. Check the box next to **Claude 3.5 Sonnet v2**
3. Click **Request model access** (or **Modify model access** if already configured)
4. Review terms and conditions
5. Submit request

**Access Approval**:
- Usually instant for most AWS accounts
- May take 1-2 business days for new accounts
- You'll receive email notification when approved

### 4.3 Verify Access

1. Return to **Model access** page
2. Status should show **Access granted** (green) next to Claude 3.5 Sonnet v2
3. Model ID: `anthropic.claude-3-5-sonnet-20241022-v2:0`

---

## Step 5: Configure Environment Variables

### 5.1 Update `.env` File

Navigate to your backend directory and edit `.env`:

```bash
cd /path/to/nodes-quantum-gates/backend
nano .env  # or use your preferred editor
```

### 5.2 Add AWS Credentials

```env
# AI & Agent Configuration
# AWS Bedrock Configuration (for Claude API via AWS)
AWS_BEDROCK_ENABLED=true

# AWS Region for Bedrock service
# Supported regions: us-east-1, us-west-2, ap-southeast-1, ap-northeast-1, eu-central-1
AWS_REGION=us-east-1

# AWS credentials for Bedrock access
# Source: IAM -> Users -> quantum-backend-bedrock -> Security credentials
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Claude model ID for Bedrock
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

**Replace**:
- `AKIAIOSFODNN7EXAMPLE` with your actual Access Key ID
- `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` with your actual Secret Access Key

### 5.3 Verify `.env` is Gitignored

```bash
# Check .gitignore contains .env
cat .gitignore | grep "^\.env$"

# If not found, add it
echo ".env" >> .gitignore
```

---

## Step 6: Test Connection

### 6.1 Quick Test Script

Create a test file to verify Bedrock access:

```bash
cd /path/to/nodes-quantum-gates/backend
nano test_bedrock.py
```

Paste the following script:

```python
#!/usr/bin/env python3
"""
Test AWS Bedrock connection for Claude 3.5 Sonnet access.
Run: python test_bedrock.py
"""

import json
import os
import sys
from datetime import datetime

import boto3
from botocore.exceptions import ClientError, NoCredentialsError


def test_bedrock_connection():
    """Test AWS Bedrock connection and Claude model invocation."""
    
    print("=" * 60)
    print("AWS BEDROCK CONNECTION TEST")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().isoformat()}\n")
    
    # Step 1: Verify environment variables
    print("Step 1: Checking environment variables...")
    
    aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_region = os.getenv("AWS_REGION", "us-east-1")
    model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")
    
    if not aws_access_key:
        print("ERROR: AWS_ACCESS_KEY_ID not found in environment")
        return False
    
    if not aws_secret_key:
        print("ERROR: AWS_SECRET_ACCESS_KEY not found in environment")
        return False
    
    print(f"  AWS_ACCESS_KEY_ID: {aws_access_key[:10]}... (FOUND)")
    print(f"  AWS_SECRET_ACCESS_KEY: ****** (HIDDEN)")
    print(f"  AWS_REGION: {aws_region}")
    print(f"  BEDROCK_MODEL_ID: {model_id}\n")
    
    # Step 2: Create Bedrock Runtime client
    print("Step 2: Creating Bedrock Runtime client...")
    
    try:
        client = boto3.client(
            service_name="bedrock-runtime",
            region_name=aws_region,
            aws_access_key_id=aws_access_key,
            aws_secret_access_key=aws_secret_key
        )
        print("  SUCCESS: Client created\n")
    except Exception as e:
        print(f"  ERROR: Failed to create client: {e}")
        return False
    
    # Step 3: Prepare test request
    print("Step 3: Preparing test request...")
    
    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 100,
        "messages": [
            {
                "role": "user",
                "content": "Say 'Hello from Claude on AWS Bedrock!' and nothing else."
            }
        ]
    }
    
    print(f"  Request body: {json.dumps(request_body, indent=2)}\n")
    
    # Step 4: Invoke model
    print("Step 4: Invoking Claude model...")
    
    try:
        response = client.invoke_model(
            modelId=model_id,
            body=json.dumps(request_body)
        )
        print("  SUCCESS: Model invoked\n")
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        print(f"  ERROR: AWS ClientError - {error_code}")
        print(f"  Message: {error_message}")
        
        if error_code == "AccessDeniedException":
            print("\n  Possible causes:")
            print("  1. Model access not granted in Bedrock console")
            print("  2. IAM user lacks bedrock:InvokeModel permission")
            print("  3. Incorrect model ID")
        elif error_code == "ResourceNotFoundException":
            print("\n  Possible causes:")
            print("  1. Model not available in this region")
            print("  2. Incorrect model ID")
        
        return False
    except NoCredentialsError:
        print("  ERROR: AWS credentials not found or invalid")
        return False
    except Exception as e:
        print(f"  ERROR: Unexpected error: {e}")
        return False
    
    # Step 5: Parse response
    print("Step 5: Parsing response...")
    
    try:
        response_body = json.loads(response["body"].read())
        
        print(f"  Response ID: {response_body.get('id', 'N/A')}")
        print(f"  Model: {response_body.get('model', 'N/A')}")
        print(f"  Stop reason: {response_body.get('stop_reason', 'N/A')}")
        
        if "content" in response_body and len(response_body["content"]) > 0:
            content = response_body["content"][0]
            if content["type"] == "text":
                print(f"\n  Claude's response:\n  \"{content['text']}\"\n")
        
        # Check usage
        usage = response_body.get("usage", {})
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        
        print(f"  Usage:")
        print(f"    Input tokens: {input_tokens}")
        print(f"    Output tokens: {output_tokens}")
        print(f"    Total tokens: {input_tokens + output_tokens}\n")
        
    except Exception as e:
        print(f"  ERROR: Failed to parse response: {e}")
        return False
    
    # Success!
    print("=" * 60)
    print("SUCCESS: AWS Bedrock connection test passed!")
    print("=" * 60)
    print("\nYour backend is ready to use Claude 3.5 Sonnet for:")
    print("  - AI Research Agent proposal analysis")
    print("  - Autonomous coalition formation")
    print("  - Research proposal auto-fragmentation")
    
    return True


if __name__ == "__main__":
    # Load .env file if present
    try:
        from dotenv import load_dotenv
        load_dotenv()
        print("INFO: Loaded variables from .env file\n")
    except ImportError:
        print("INFO: python-dotenv not installed, using system environment variables\n")
    
    success = test_bedrock_connection()
    sys.exit(0 if success else 1)
```

### 6.2 Run Test Script

```bash
# Make sure you're in the backend directory with .env file
cd /path/to/nodes-quantum-gates/backend

# Install boto3 if not already installed
pip install boto3 python-dotenv

# Run test
python test_bedrock.py
```

### 6.3 Expected Output

```
INFO: Loaded variables from .env file

============================================================
AWS BEDROCK CONNECTION TEST
============================================================
Timestamp: 2026-05-20T15:30:45.123456

Step 1: Checking environment variables...
  AWS_ACCESS_KEY_ID: AKIAIOSFO... (FOUND)
  AWS_SECRET_ACCESS_KEY: ****** (HIDDEN)
  AWS_REGION: us-east-1
  BEDROCK_MODEL_ID: anthropic.claude-3-5-sonnet-20241022-v2:0

Step 2: Creating Bedrock Runtime client...
  SUCCESS: Client created

Step 3: Preparing test request...
  Request body: {
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 100,
  "messages": [
    {
      "role": "user",
      "content": "Say 'Hello from Claude on AWS Bedrock!' and nothing else."
    }
  ]
}

Step 4: Invoking Claude model...
  SUCCESS: Model invoked

Step 5: Parsing response...
  Response ID: msg_abc123xyz...
  Model: claude-3-5-sonnet-20241022
  Stop reason: end_turn

  Claude's response:
  "Hello from Claude on AWS Bedrock!"

  Usage:
    Input tokens: 15
    Output tokens: 8
    Total tokens: 23

============================================================
SUCCESS: AWS Bedrock connection test passed!
============================================================

Your backend is ready to use Claude 3.5 Sonnet for:
  - AI Research Agent proposal analysis
  - Autonomous coalition formation
  - Research proposal auto-fragmentation
```

---

## Troubleshooting

### Error: AccessDeniedException

**Symptom**: `An error occurred (AccessDeniedException) when calling the InvokeModel operation`

**Solutions**:
1. Verify model access granted in Bedrock console:
   - Go to Bedrock > Model access
   - Check Claude 3.5 Sonnet v2 shows "Access granted"
2. Verify IAM permissions:
   - IAM > Users > quantum-backend-bedrock > Permissions
   - Should have `AmazonBedrockFullAccess` or custom policy with `bedrock:InvokeModel`
3. Wait 5-10 minutes after requesting model access (propagation delay)

### Error: NoCredentialsError

**Symptom**: `Unable to locate credentials`

**Solutions**:
1. Verify `.env` file exists in backend directory
2. Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set
3. Check for typos in key names (case-sensitive)
4. Restart your terminal/IDE to reload environment

### Error: ResourceNotFoundException

**Symptom**: `Could not find model with ID: anthropic.claude-3-5-sonnet...`

**Solutions**:
1. Verify region supports Claude:
   - Supported: us-east-1, us-west-2, ap-southeast-1, ap-northeast-1, eu-central-1
   - Change `AWS_REGION` in `.env` if needed
2. Verify model ID spelling:
   - Correct: `anthropic.claude-3-5-sonnet-20241022-v2:0`
3. Check for model version updates (AWS occasionally changes IDs)

### Error: ThrottlingException

**Symptom**: `Rate exceeded` or `TooManyRequestsException`

**Solutions**:
1. Add exponential backoff to your code
2. Request quota increase in AWS Service Quotas console
3. Default limits:
   - 10,000 tokens/minute (input + output combined)
   - 100 requests/minute

### Connection Times Out

**Symptom**: Request hangs for 60+ seconds

**Solutions**:
1. Check network connectivity to AWS
2. Verify no firewall blocking port 443
3. Try different AWS region
4. Check AWS service health: https://status.aws.amazon.com

---

## Cost Estimates

### Pricing (as of May 2026)

**Claude 3.5 Sonnet v2 on Bedrock**:
- Input tokens: $3.00 per million tokens
- Output tokens: $15.00 per million tokens

### Example Costs

**AI Research Agent Proposal Analysis**:
- Input: 5,000 tokens (proposal text)
- Output: 500 tokens (analysis JSON)
- Cost per analysis: $0.0225

**Auto-Fragmentation**:
- Input: 3,000 tokens (proposal)
- Output: 1,000 tokens (fragment list)
- Cost per fragmentation: $0.024

**Monthly Estimates**:
- 100 proposals analyzed: $2.25
- 50 proposals fragmented: $1.20
- Total: ~$3.45/month (low usage)
- High usage (1,000 proposals/month): ~$34.50/month

**Comparison to Direct Anthropic API**:
- Bedrock pricing is identical to Anthropic's API pricing
- Bedrock adds AWS infrastructure benefits (IAM, CloudWatch, VPC, etc.)
- No additional AWS charges for Bedrock itself (only model usage)

### Cost Optimization Tips

1. Use prompt caching for repeated context
2. Set reasonable `max_tokens` limits
3. Implement response caching for duplicate requests
4. Monitor usage in AWS Cost Explorer
5. Set up billing alerts in AWS Budgets

---

## Next Steps

After successful setup:

1. **Phase 3 (AI Agents)**:
   - Create AI agents via `/agents` API
   - Test proposal analysis: `POST /agents/:id/analyze`
   - Test autonomous funding workflows

2. **Phase 4 (Research Crowdfunding)**:
   - Create research proposals: `POST /proposals`
   - Test auto-fragmentation (uses Claude)
   - Verify fragments stored in MongoDB

3. **Production Considerations**:
   - Implement retry logic with exponential backoff
   - Add structured logging for Bedrock calls
   - Set up CloudWatch alarms for errors/throttling
   - Consider AWS Secrets Manager for credentials
   - Enable AWS CloudTrail for audit logging

4. **Monitoring**:
   - Track token usage in CloudWatch Metrics
   - Set billing alerts (e.g., alert if >$50/month)
   - Monitor response latencies
   - Log all API errors

---

## Additional Resources

- **AWS Bedrock Documentation**: https://docs.aws.amazon.com/bedrock/
- **Claude on Bedrock Guide**: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude.html
- **boto3 Bedrock Reference**: https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/bedrock-runtime.html
- **Anthropic API Reference**: https://docs.anthropic.com/
- **Cost Calculator**: https://calculator.aws/

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-20  
**Maintained By**: Quantum Backend Team
