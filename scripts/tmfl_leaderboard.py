#!/usr/bin/env python3
"""Rebuild TMFL leaderboard from GitHub Issues and published official scores."""
import json, os, re, subprocess, urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPO=os.environ.get("GITHUB_REPOSITORY","TMFL-Guy/fan-tmfl-portal")
TOKEN=os.environ.get("GITHUB_TOKEN","")
def api(path):
    req=urllib.request.Request("https://api.github.com/repos/"+REPO+"/"+path,headers={"Accept":"application/vnd.github+json","Authorization":"Bearer "+TOKEN,"User-Agent":"TMFL-Leaderboard"})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
schedule={g["id"]:g for g in json.loads((ROOT/"tmfl-schedule.json").read_text())}
official=json.loads((ROOT/"tmfl-official-results.json").read_text())
# Historical publication timestamps prevent predictions submitted after a final was posted.
# Uses the repository's complete git history of the official results feed.
first_final={}
try:
    commits=subprocess.check_output(["git","log","--reverse","--format=%H","--","tmfl-official-results.json"],cwd=ROOT,text=True).splitlines()
    for sha in commits:
        raw=subprocess.check_output(["git","show",sha+":tmfl-official-results.json"],cwd=ROOT,text=True)
        past=json.loads(raw)
        timestamp=subprocess.check_output(["git","show","-s","--format=%cI",sha],cwd=ROOT,text=True).strip()
        for gid,result in past.items():
            if gid not in first_final and isinstance(result,dict) and isinstance(result.get("a"),int) and isinstance(result.get("h"),int):
                first_final[gid]=timestamp
except (subprocess.CalledProcessError,ValueError) as e:
    raise RuntimeError("Cannot verify official-result publication history; refusing to score picks") from e
# The first accepted submission per GitHub user per game wins; edits do not count.
issues=[]; page=1
while True:
    batch=api("issues?state=all&per_page=100&page="+str(page))
    issues.extend(i for i in batch if "pull_request" not in i)
    if len(batch)<100:break
    page+=1
picks={}
for issue in sorted(issues,key=lambda i:(i["created_at"],i["number"])):
    if issue.get("state_reason")=="not_planned" or not issue.get("title","").startswith("TMFL Prediction"):continue
    body=issue.get("body") or ""
    # GitHub Issue Forms serialize fields under Markdown headings.
    def field(name):
        m=re.search(r"### "+re.escape(name)+r"\s*\n+([^\n]+)",body,re.I)
        return m.group(1).strip() if m else ""
    gid=field("Game ID").upper()
    a,h=field("Away score"),field("Home score")
    user=issue["user"]["login"]
    if gid not in schedule or not a.isdigit() or not h.isdigit():continue
    if gid in first_final and datetime.fromisoformat(issue["created_at"].replace("Z","+00:00")) >= datetime.fromisoformat(first_final[gid].replace("Z","+00:00")):continue
    if max(int(a),int(h))>999:continue
    key=(user.lower(),gid)
    if key in picks:continue
    picks[key]={"user":user,"game":gid,"away":int(a),"home":int(h),"issue":issue["number"]}
stats=defaultdict(lambda:{"points":0,"correct":0,"exact":0,"scored":0,"submitted":0})
for (user,gid),p in picks.items():
    row=stats[user];row["user"]=p["user"];row["submitted"]+=1
    final=official.get(gid)
    if not isinstance(final,dict) or not isinstance(final.get("a"),int) or not isinstance(final.get("h"),int):continue
    row["scored"]+=1
    sign=lambda a,b:(a>b)-(a<b)
    if sign(p["away"],p["home"])==sign(final["a"],final["h"]):
        row["correct"]+=1;row["points"]+=1
    if p["away"]==final["a"] and p["home"]==final["h"]:
        row["exact"]+=1;row["points"]+=2
rows=sorted(stats.values(),key=lambda r:(-r["points"],-r["exact"],-r["correct"],r["user"].lower()))
for rank,row in enumerate(rows,1):row["rank"]=rank
(ROOT/"tmfl-leaderboard.json").write_text(json.dumps({"scoring":"Correct outcome = 1 point; exact score = 2 additional points","players":rows},indent=2)+"\n")
print("Updated leaderboard for",len(rows),"players")
