#!/usr/bin/env python3
"""Build independent public prediction leaderboards from GitHub issue submissions."""
import json, os, re, urllib.request
from collections import defaultdict
from pathlib import Path

REPO=os.environ.get("GITHUB_REPOSITORY","TMFL-Guy/fan-tmfl-portal")
TOKEN=os.environ.get("GITHUB_TOKEN","")
TYPES=("cup-games","cup-bracket","rivalry","division","conference","league","isc-seeding")
def github_issues():
    page=1
    while True:
        req=urllib.request.Request(f"https://api.github.com/repos/{REPO}/issues?state=all&per_page=100&page={page}",
            headers={"Accept":"application/vnd.github+json","Authorization":f"Bearer {TOKEN}","User-Agent":"TMFL-Leaderboards"})
        with urllib.request.urlopen(req,timeout=30) as response:
            items=json.load(response)
        if not items: break
        for issue in items:
            if "pull_request" not in issue: yield issue
        if len(items)<100: break
        page+=1

def read_cup():
    try:return json.loads(Path("tmfl-in-season-cup.json").read_text())
    except (OSError,ValueError):return {}

def outcomes(cup):
    games={g.get("id"):g for g in cup.get("games",[]) if isinstance(g,dict)}
    for gid,g in (cup.get("knockout") or {}).items():
        if not isinstance(g,dict):continue
        a,b=g.get("a") or {},g.get("b") or {}
        games[gid]={"away":a.get("team"),"home":b.get("team"),"awayScore":a.get("score"),"homeScore":b.get("score")}
    return games

def result(g):
    try:
        a,h=g.get("awayScore"),g.get("homeScore")
        if a is None or h is None or a=="" or h=="":return None
        a,h=int(a),int(h)
        if a==h:return None
        return g.get("away") if a>h else g.get("home")
    except (ValueError,TypeError):return None

def score_submission(competition,picks,cup):
    scored=points=0
    games=outcomes(cup)
    if competition in ("cup-games","cup-bracket"):
        for key,choice in picks.items():
            if not key.startswith(competition+"|"):continue
            game=games.get(key.split("|",1)[1])
            winner=result(game) if game else None
            if winner:
                scored+=1
                points+=3 if choice==winner else 0
    elif competition=="isc-seeding":
        for group in "ABCDEFGH":
            games_in_group=[g for g in cup.get("games",[]) if g.get("stage")=="group" and g.get("group")==group]
            teams=cup.get("groups",{}).get(group,[])
            if len(teams)!=4 or len(games_in_group)!=6 or any(result(g) is None for g in games_in_group):continue
            stats={t:{"w":0,"l":0,"diff":0} for t in teams}
            for g in games_in_group:
                a,h=g["away"],g["home"]
                if a not in stats or h not in stats:continue
                winner=result(g)
                stats[winner]["w"]+=1
                stats[h if winner==a else a]["l"]+=1
                stats[a]["diff"]+=int(g["awayScore"])-int(g["homeScore"])
                stats[h]["diff"]+=int(g["homeScore"])-int(g["awayScore"])
            actual=sorted(teams,key=lambda t:(-stats[t]["w"],-stats[t]["diff"],teams.index(t)))
            predicted=picks.get("isc-seeding|Group "+group,[])
            records=picks.get("isc-record|Group "+group,{})
            if not isinstance(predicted,list) or len(predicted)!=4:continue
            for pos,team in enumerate(predicted):
                scored+=1
                points+=3 if team==actual[pos] else 0
                if team in stats and isinstance(records,dict):
                    record=records.get(team,{})
                    if isinstance(record,dict) and str(record.get("w"))==str(stats[team]["w"]) and str(record.get("l"))==str(stats[team]["l"]):points+=2
    # Standings and rivalry rankings remain pending until a verified official
    # final standings snapshot is published. Never score against projections.
    return points,scored

def main():
    cup=read_cup()
    entries=defaultdict(dict)
    for issue in github_issues():
        match=re.search(r"```json\s*(\{.*?\})\s*```",issue.get("body") or "",re.S)
        if not match:continue
        try:payload=json.loads(match.group(1))
        except ValueError:continue
        comp=payload.get("competition")
        picks=payload.get("picks")
        user=(issue.get("user") or {}).get("login")
        if comp not in TYPES or not isinstance(picks,dict) or not user:continue
        if len(json.dumps(picks))>30000:continue
        entries[comp].setdefault(user.lower(),{"user":user,"picks":{},"submitted":0})
        row=entries[comp][user.lower()]
        # First submission per prediction key is final, to prevent editing
        # picks after games are played.
        for key,value in picks.items():
            if isinstance(key,str) and (key.startswith(comp+"|") or (comp=="isc-seeding" and key.startswith("isc-record|"))):
                row["picks"].setdefault(key,value)
        row["submitted"]+=1
    boards={}
    for comp in TYPES:
        rows=[]
        for row in entries[comp].values():
            points,scored=score_submission(comp,row["picks"],cup)
            rows.append({"user":row["user"],"points":points,"scored":scored,"submitted":row["submitted"]})
        rows.sort(key=lambda r:(-r["points"],-r["scored"],r["user"].lower()))
        for index,row in enumerate(rows,1):row["rank"]=index
        boards[comp]=rows
    Path("tmfl-pool-leaderboards.json").write_text(json.dumps({"version":1,"boards":boards},indent=2)+"\n")

if __name__=="__main__":main()
