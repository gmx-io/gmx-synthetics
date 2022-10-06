import json
import glob

def get_contract_size(fp):
  with open(fp) as f:
    return len(json.load(f)["deployedBytecode"]) // 2

filepaths = [i for i in glob.glob('./artifacts/**/**/*.sol/*.json') if ".dbg." not in i]
results = sizes = [(fp, get_contract_size(fp)) for fp in filepaths]

print("Top 10")
for fp, size in sorted(results, key=lambda x: x[1], reverse=True)[:10]:
  print(f"{size:,}b - {fp.split('/')[-1]}")
