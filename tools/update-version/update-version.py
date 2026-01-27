#!/usr/bin/env python3
"""
Actualiza los parámetros de versión en index.html para cache busting
"""

import re
import os
import sys
from pathlib import Path
from datetime import datetime

def update_version(project_name=None):
    # Generate timestamp version
    version = int(datetime.now().timestamp() * 1000)
    
    # Get the project root (parent of tools directory)
    script_dir = Path(__file__).parent.parent.parent
    
    # Get project name from argument or directory name
    if not project_name:
        project_name = script_dir.name
    
    html_path = script_dir / 'index.html'
    
    if not html_path.exists():
        print(f"❌ Error: {html_path} no encontrado")
        return
    
    # Read index.html
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Remove existing version parameters from URLs
    html = re.sub(r'\?v=\d+', '', html)
    
    # Add version parameter to CSS
    html = re.sub(
        r'(<link[^>]*href=["\'])(assets/styles/styles\.css)(["\'][^>]*>)',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to NRD Data Access (localhost only)
    html = re.sub(
        r"(const nrdDataAccessSrc = isLocalhost\s*\?\s*['\"])(/nrd-data-access/dist/nrd-data-access\.js)(['\"])",
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to NRD Common (localhost only)
    html = re.sub(
        r"(const nrdCommonSrc = isLocalhost\s*\?\s*['\"])(/nrd-common/dist/nrd-common\.js)(['\"])",
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to app.js
    html = re.sub(
        r'(<script[^>]*src=["\'])(app\.js)(["\'][^>]*>)',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to service worker
    html = re.sub(
        r"(navigator\.serviceWorker\.register\(['\"])(service-worker\.js)(['\"])",
        rf'\1\2?v={version}\3',
        html
    )
    
    # Update version in the URL parameter check script (if it exists)
    html = re.sub(
        r"(const stylesheet = document\.querySelector\('link\[href\*=\"assets/styles/styles\.css\"\]'\);\s*const versionMatch = stylesheet \? stylesheet\.href\.match\(/\[\\?&\]v=\(\\d\+\)/\) : null;\s*const currentVersion = versionMatch \? versionMatch\[1\] : )Date\.now\(\);",
        rf'const stylesheet = document.querySelector(\'link[href*="assets/styles/styles.css"]\');\n      const versionMatch = stylesheet ? stylesheet.href.match(/[?&]v=(\\d+)/) : null;\n      const currentVersion = versionMatch ? versionMatch[1] : {version};',
        html
    )
    
    # Write back
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"✅ {project_name}: Version updated to: {version}")

if __name__ == "__main__":
    # Accept optional project name argument (for compatibility with server.sh)
    project_name = sys.argv[1] if len(sys.argv) > 1 else None
    update_version(project_name)
