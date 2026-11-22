#!/usr/bin/env python3
"""Rebuild TMFL leaderboard from GitHub Issues and published official scores."""
import json, os, re, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPO=os.environ.get("GITHUB_REPOSITORY","TMFL-Guy/fan-tmfl-portal")
TOKEN=os.environ.get("GITHUB_TOKEN","")
def api(path):
    req=urllib.request.Request("https://api.github.com/repos/"+REPO+"/"+path,headers={"Accept":"application/vnd.github+json","Authorization":"Bearer "+TOKEN,"User-Agent":"TMFL-Leaderboard"})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
schedule={g["id"]:g for g in json.loads((ROOT/"tmfl-schedule.json").read_text())}
official=json.loads((ROOT/"tmfl-official-results.json").read_text())
# The first accepted submission per GitHub user per game wins; edits do not count.
issues=[]; page=1
while True:
    batch=api("issues?state=all&labels=tmfl-prediction&per_page=100&page="+str(page))
    issues.extend(i for i in batch if "pull_request" not in i)
    if len(batch)<100:break
    page+=1
picks={}
for issue in sorted(issues,key=lambda i:(i["created_at"],i["number"])):
    if issue.get("state_reason")=="not_planned":continue
    body=issue.get("body") or ""
    # GitHub Issue Forms serialize fields under Markdown headings.
    def field(name):
        m=re.search(r"### "+re.escape(name)+r"\s*\n+([^\n]+)",body,re.I)
        return m.group(1).strip() if m else ""
    gid=field("Game ID").upper()
    a,h=field("Away score"),field("Home score")
    user=issue["user"]["login"]
    if gid not in schedule or not a.isdigit() or not h.isdigit():continue
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
