---
name: wsf-set-profile
description: "Switch model profile for WSF agents (quality/balanced/budget/inherit)"
argument-hint: "<profile (quality|balanced|budget|inherit)>"
tools:
  bash: true
---


Show the following output to the user verbatim, with no extra commentary:

!`node "/Users/sam/coding/wopal/wopal-workspace/.wopal/wsf/bin/wsf-tools.cjs" config-set-model-profile $ARGUMENTS --raw`
