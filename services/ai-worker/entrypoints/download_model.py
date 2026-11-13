import argparse
import json
import re
from pathlib import Path
from huggingface_hub import HfApi, snapshot_download

parser=argparse.ArgumentParser()
parser.add_argument('--repo',default='Qwen/Qwen3-VL-4B-Instruct')
parser.add_argument('--revision',required=True,help='Use an immutable commit hash, never main')
parser.add_argument('--output',required=True)
args=parser.parse_args()
if not re.fullmatch('[0-9a-f]{40}',args.revision): parser.error('revision must be a 40-character commit SHA')
# Hub cache resumes incomplete blobs. Download is explicit and single-checkpoint.
snapshot_download(repo_id=args.repo,revision=args.revision,local_dir=args.output,max_workers=1)
(Path(args.output)/'model-manifest.json').write_text(json.dumps({'repo':args.repo,'revision':args.revision},indent=2))
