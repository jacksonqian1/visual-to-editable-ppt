#!/usr/bin/env python3
"""Create native PPT groups for explicitly named objects, preserving coordinates."""
import argparse, json, zipfile, tempfile, os
from xml.etree import ElementTree as ET
NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
for k,v in NS.items(): ET.register_namespace(k,v)
def tag(ns,n): return '{'+NS[ns]+'}'+n

def group_package(filename, spec):
    lookup={x['name']:x for x in spec}; found=set(); count=0
    with zipfile.ZipFile(filename) as src:
        payload={n:src.read(n) for n in src.namelist()}
    for name,data in list(payload.items()):
        if not (name.startswith('ppt/slides/slide') and name.endswith('.xml')): continue
        root=ET.fromstring(data); tree=root.find('p:cSld/p:spTree',NS)
        groups={}
        for child in list(tree):
            nv=child.find('.//p:cNvPr',NS)
            if nv is not None and nv.get('name') in lookup:
                entry=lookup[nv.get('name')];found.add(nv.get('name'));groups.setdefault(entry['groupId'],[]).append((child,entry))
        next_id=max(int(n.get('id','0')) for n in root.findall('.//p:cNvPr',NS))+1
        for gid,members in groups.items():
            if len(members)<2: continue
            bounds=[]
            for child,_ in members:
                xf=child.find('p:spPr/a:xfrm',NS)
                if xf is None: raise ValueError('Grouping requires shape transforms')
                off=xf.find('a:off',NS);ext=xf.find('a:ext',NS)
                bounds.append(tuple(int(v) for v in (off.get('x'),off.get('y'),ext.get('cx'),ext.get('cy'))))
            x=min(b[0] for b in bounds);y=min(b[1] for b in bounds)
            w=max(1,max(b[0]+b[2] for b in bounds)-x);h=max(1,max(b[1]+b[3] for b in bounds)-y)
            group=ET.Element(tag('p','grpSp')); nv=ET.SubElement(group,tag('p','nvGrpSpPr'))
            ET.SubElement(nv,tag('p','cNvPr'),id=str(next_id),name=members[0][1]['groupName']);next_id+=1
            ET.SubElement(nv,tag('p','cNvGrpSpPr'));ET.SubElement(nv,tag('p','nvPr'))
            gp=ET.SubElement(group,tag('p','grpSpPr'));xf=ET.SubElement(gp,tag('a','xfrm'))
            for n,attrs in [('off',{'x':str(x),'y':str(y)}),('ext',{'cx':str(w),'cy':str(h)}),('chOff',{'x':str(x),'y':str(y)}),('chExt',{'cx':str(w),'cy':str(h)})]:ET.SubElement(xf,tag('a',n),attrs)
            position=list(tree).index(members[0][0])
            for child,_ in members:
                nv=child.find('.//p:cNvPr',NS);nv.set('name',nv.get('name').split('] ',1)[-1]);tree.remove(child);group.append(child)
            tree.insert(position,group);count+=1
        payload[name]=ET.tostring(root,encoding='utf-8',xml_declaration=True)
    if found != set(lookup): raise ValueError('Missing grouped objects: '+str(set(lookup)-found))
    fd,tmp=tempfile.mkstemp(suffix='.pptx',dir=os.path.dirname(os.path.abspath(filename)));os.close(fd)
    try:
        with zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED) as out:
            for name,data in payload.items():out.writestr(name,data)
        os.replace(tmp,filename)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return count
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('pptx');p.add_argument('--spec',required=True);a=p.parse_args()
    print('Native PowerPoint groups:',group_package(a.pptx,json.load(open(a.spec))))
