#!/usr/bin/env python3
"""Fit reviewed sampled curve chains; group only explicit-color endpoint-connected branches.
Report-only by default. Interior crossings never imply a shared branch group.
"""
import argparse,json,math,copy
from pathlib import Path

def near(a,b):return math.dist(a,b)<1e-5
def start(e):return (e['x1'],e['y1'])
def end(e):return (e['x2'],e['y2'])
def fit_cubic(points):
    n=len(points)-1;aa=ab=bb=0.;rhs=[[0.,0.],[0.,0.]]
    for i,p in enumerate(points):
        t=i/n;u=1-t;a=3*u*u*t;b=3*u*t*t;aa+=a*a;ab+=a*b;bb+=b*b
        for k in range(2):
            v=p[k]-u**3*points[0][k]-t**3*points[-1][k];rhs[k][0]+=a*v;rhs[k][1]+=b*v
    det=aa*bb-ab*ab
    if abs(det)<1e-12:raise ValueError('Too few points')
    c1=[(r[0]*bb-r[1]*ab)/det for r in rhs];c2=[(r[1]*aa-r[0]*ab)/det for r in rhs]
    err=0.
    for i,p in enumerate(points):
        t=i/n;u=1-t;q=[u**3*points[0][k]+3*u*u*t*c1[k]+3*u*t*t*c2[k]+t**3*points[-1][k] for k in range(2)];err=max(err,math.dist(q,p))
    return c1,c2,err

def endpoint_on(p,e):
    a,b=start(e),end(e);dx=b[0]-a[0];dy=b[1]-a[1];d=dx*dx+dy*dy
    if not d:return near(p,a)
    t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d
    return -1e-8<=t<=1+1e-8 and math.dist(p,(a[0]+t*dx,a[1]+t*dy))<1e-5

def optimize(scene,curve_color,branch_color,tolerance):
    scene=copy.deepcopy(scene);elements=scene['elements'];candidates=[e for e in elements if e['type']=='line' and e.get('stroke','').lower()==curve_color.lower() and not e.get('groupId')]
    def compatible(a,b):return all(a.get(k)==b.get(k) for k in ['stroke','strokeWidth','dash','z'])
    nxt={e['id']:[b for b in candidates if b is not e and compatible(e,b) and near(end(e),start(b))] for e in candidates}
    prev={e['id']:[b for b in candidates if b is not e and compatible(e,b) and near(end(b),start(e))] for e in candidates}
    used=set();replace={};report={'curves':[],'groups':[],'rejected':[]}
    for e in candidates:
        if e['id'] in used or prev[e['id']]:continue
        chain=[e]
        while len(nxt[chain[-1]['id']])==1 and chain[-1].get('endArrow','none')=='none':
            b=nxt[chain[-1]['id']][0]
            if len(prev[b['id']])!=1 or b in chain or b.get('startArrow','none')!='none':break
            chain.append(b)
        if len(chain)<3:continue
        points=[start(chain[0])]+[end(x) for x in chain];c1,c2,err=fit_cubic(points)
        if err>tolerance:report['rejected'].append({'ids':[x['id'] for x in chain],'maxError':err});continue
        allpoints=points+[c1,c2];x=min(p[0] for p in allpoints);y=min(p[1] for p in allpoints);w=max(1,max(p[0] for p in allpoints)-x);h=max(1,max(p[1] for p in allpoints)-y)
        new=copy.deepcopy(e);new.update(type='path',name='连续关系曲线 '+str(len(report['curves'])+1),x=x,y=y,width=w,height=h,pathWidth=w,pathHeight=h,endArrow=chain[-1].get('endArrow','none'),pathPoints=[{'x':points[0][0]-x,'y':points[0][1]-y},{'x':points[-1][0]-x,'y':points[-1][1]-y,'curve':{'type':'cubic','x1':c1[0]-x,'y1':c1[1]-y,'x2':c2[0]-x,'y2':c2[1]-y}}])
        for key in ['x1','y1','x2','y2','overlapGroup','overlapKind','overlapRole']:new.pop(key,None)
        replace[e['id']]=new;used.update(c['id'] for c in chain);report['curves'].append({'id':e['id'],'sourceIds':[c['id'] for c in chain],'maxError':err,'segmentsBefore':len(chain)})
    scene['elements']=[replace[e['id']] if e['id'] in replace else e for e in elements if e['id'] not in used or e['id'] in replace]
    branches=[e for e in scene['elements'] if e['type']=='line' and e.get('stroke','').lower()==branch_color.lower() and not e.get('groupId')];seen=set()
    for e in branches:
        if e['id'] in seen:continue
        group=[e];seen.add(e['id'])
        for a in group:
            for b in branches:
                if b['id'] in seen or not compatible(a,b):continue
                if any(endpoint_on(p,b) for p in [start(a),end(a)]) or any(endpoint_on(p,a) for p in [start(b),end(b)]):group.append(b);seen.add(b['id'])
        if len(group)<2:continue
        gid='branch-'+e['id'];name='层级分支 '+str(len(report['groups'])+1)
        for b in group:b.update(groupId=gid,groupName=name)
        report['groups'].append({'id':gid,'name':name,'members':[b['id'] for b in group]})
    scene.setdefault('metadata',{})['connectorOptimization']=report
    return scene,report
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output');p.add_argument('--curve-color',required=True);p.add_argument('--branch-color',required=True);p.add_argument('--tolerance',type=float,default=.5);p.add_argument('--report',required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
    scene,report=optimize(json.loads(Path(a.input).read_text()),a.curve_color,a.branch_color,a.tolerance);Path(a.report).write_text(json.dumps(report,ensure_ascii=False,indent=2))
    if a.apply:
        if not a.output:raise SystemExit('--output required with --apply')
        Path(a.output).write_text(json.dumps(scene,ensure_ascii=False,indent=2))
    print(json.dumps({'curves':len(report['curves']),'groups':len(report['groups']),'rejected':len(report['rejected']),'applied':a.apply}))
