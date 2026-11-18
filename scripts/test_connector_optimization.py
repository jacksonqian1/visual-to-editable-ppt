import unittest
from optimize_scene_connectors import optimize

def line(i,a,b,color='#gray',arrow='none'):
    return dict(id=str(i),name=str(i),type='line',x1=a[0],y1=a[1],x2=b[0],y2=b[1],stroke=color,strokeWidth=1,z=9,endArrow=arrow)
def scene(es):return {'elements':es}
def run(s):return optimize(s,'#gray','#red',.01)
class Connectors(unittest.TestCase):
    def test_cubic_roundtrip_and_idempotency(self):
        p=[]
        for i in range(21):
            t=i/20;u=1-t;p.append((100*u**3+240*u*u*t+60*u*t*t,30*u**3+90*u*u*t+240*u*t*t+100*t**3))
        es=[line(i,p[i],p[i+1],arrow='triangle' if i==19 else 'none') for i in range(20)]
        out,r=run(scene(es));self.assertEqual(len(out['elements']),1);self.assertLess(r['curves'][0]['maxError'],1e-9)
        self.assertEqual(out['elements'][0]['endArrow'],'triangle');self.assertEqual(out['elements'][0]['type'],'path')
        again,r2=run(out);self.assertEqual(again['elements'],out['elements']);self.assertEqual(r2['curves'],[])
    def test_interior_crossing_is_not_group(self):
        out,r=run(scene([line(1,(0,5),(10,5),'#red'),line(2,(5,0),(5,10),'#red')]))
        self.assertEqual(r['groups'],[])
    def test_branch_endpoint_on_trunk_is_group(self):
        out,r=run(scene([line(1,(0,0),(0,20),'#red'),line(2,(0,10),(10,10),'#red')]))
        self.assertEqual(len(r['groups']),1);self.assertEqual(out['elements'][0]['groupId'],out['elements'][1]['groupId'])
    def test_bad_curve_is_retained(self):
        p=[(0,0),(1,30),(2,-20),(3,40),(4,-40),(5,0)]
        es=[line(i,p[i],p[i+1]) for i in range(5)];out,r=run(scene(es))
        self.assertEqual(out['elements'],es);self.assertEqual(len(r['rejected']),1)
    def test_different_depth_not_grouped(self):
        a=line(1,(0,0),(0,20),'#red');b=line(2,(0,10),(10,10),'#red');b['z']=10
        self.assertEqual(run(scene([a,b]))[1]['groups'],[])
if __name__=='__main__':unittest.main()
