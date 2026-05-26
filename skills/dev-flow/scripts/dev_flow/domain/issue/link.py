#!/usr/bin/env python3
# link.py - Issue link domain operations
#
# Provides:
#   - build_repo_blob_url: Build GitHub blob URL for repo path
#
# Ported from lib/issue.sh


def build_repo_blob_url(repo: str, repo_path: str) -> str:
    """
    Build GitHub blob URL for a repository path.
    
    Args:
        repo: Repository in owner/repo format (e.g., "sampx/wopal-space")
        repo_path: Path within the repository (e.g., "docs/projects/ontology/plans/120.md")
        
    Returns:
        Full GitHub blob URL (e.g., "https://github.com/sampx/wopal-space/blob/main/docs/projects/ontology/plans/120.md")
    """
    return f"https://github.com/{repo}/blob/main/{repo_path}"