
// ── Phase 15.3 — Bibliothèque SDF complète (Inigo Quilez) ────────────────────

export const SDF_PRIMITIVES = [
  { id: 'sdSphere',        label: 'Sphere',            params: ['vec3 p', 'float r'],
    code: `float sdSphere(vec3 p,float r){return length(p)-r;}` },
  { id: 'sdBox',           label: 'Box',               params: ['vec3 p', 'vec3 b'],
    code: `float sdBox(vec3 p,vec3 b){vec3 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.);}` },
  { id: 'sdRoundBox',      label: 'Round Box',         params: ['vec3 p', 'vec3 b', 'float r'],
    code: `float sdRoundBox(vec3 p,vec3 b,float r){vec3 d=abs(p)-b+r;return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.)-r;}` },
  { id: 'sdBoxFrame',      label: 'Box Frame',         params: ['vec3 p', 'vec3 b', 'float e'],
    code: `float sdBoxFrame(vec3 p,vec3 b,float e){p=abs(p)-b;vec3 q=abs(p+e)-e;return min(min(length(max(vec3(p.x,q.y,q.z),0.))+min(max(p.x,max(q.y,q.z)),0.),length(max(vec3(q.x,p.y,q.z),0.))+min(max(q.x,max(p.y,q.z)),0.)),length(max(vec3(q.x,q.y,p.z),0.))+min(max(q.x,max(q.y,p.z)),0.));}` },
  { id: 'sdTorus',         label: 'Torus',             params: ['vec3 p', 'vec2 t'],
    code: `float sdTorus(vec3 p,vec2 t){vec2 q=vec2(length(p.xz)-t.x,p.y);return length(q)-t.y;}` },
  { id: 'sdCappedTorus',   label: 'Capped Torus',      params: ['vec3 p', 'vec2 sc', 'float ra', 'float rb'],
    code: `float sdCappedTorus(vec3 p,vec2 sc,float ra,float rb){p.x=abs(p.x);float k=(sc.y*p.x>sc.x*p.y)?dot(p.xy,sc):length(p.xy);return sqrt(dot(p,p)+ra*ra-2.*ra*k)-rb;}` },
  { id: 'sdLink',          label: 'Link',              params: ['vec3 p', 'float le', 'float r1', 'float r2'],
    code: `float sdLink(vec3 p,float le,float r1,float r2){vec3 q=vec3(p.x,max(abs(p.y)-le,0.),p.z);return length(vec2(length(q.xy)-r1,q.z))-r2;}` },
  { id: 'sdInfCylinder',   label: 'Infinite Cylinder',  params: ['vec3 p', 'vec3 c'],
    code: `float sdInfCylinder(vec3 p,vec3 c){return length(p.xz-c.xy)-c.z;}` },
  { id: 'sdCone',          label: 'Cone',              params: ['vec3 p', 'vec2 c', 'float h'],
    code: `float sdCone(vec3 p,vec2 c,float h){vec2 q=h*vec2(c.x/c.y,-1.);vec2 w=vec2(length(p.xz),p.y);vec2 a=w-q*clamp(dot(w,q)/dot(q,q),0.,1.);vec2 b=w-q*vec2(clamp(w.x/q.x,0.,1.),1.);float k=sign(q.y),d=min(dot(a,a),dot(b,b)),s=max(k*(w.x*q.y-w.y*q.x),k*(w.y-q.y));return sqrt(d)*sign(s);}` },
  { id: 'sdConeInf',       label: 'Infinite Cone',     params: ['vec3 p', 'vec2 c'],
    code: `float sdConeInf(vec3 p,vec2 c){vec2 q=vec2(length(p.xz),p.y);float d=length(q-c*max(dot(q,c),0.));return d*((q.x*c.y-q.y*c.x<0.)?-1.:1.);}` },
  { id: 'sdPlane',         label: 'Plane',             params: ['vec3 p', 'vec3 n', 'float h'],
    code: `float sdPlane(vec3 p,vec3 n,float h){return dot(p,n)+h;}` },
  { id: 'sdHexPrism',      label: 'Hex Prism',         params: ['vec3 p', 'vec2 h'],
    code: `float sdHexPrism(vec3 p,vec2 h){const vec3 k=vec3(-.866,.5,.577);p=abs(p);p.xy-=2.*min(dot(k.xy,p.xy),0.)*k.xy;vec2 d=vec2(length(p.xy-vec2(clamp(p.x,-k.z*h.x,k.z*h.x),h.x))*sign(p.y-h.x),p.z-h.y);return min(max(d.x,d.y),0.)+length(max(d,0.));}` },
  { id: 'sdTriPrism',      label: 'Triangular Prism',  params: ['vec3 p', 'vec2 h'],
    code: `float sdTriPrism(vec3 p,vec2 h){vec3 q=abs(p);return max(q.z-h.y,max(q.x*.866+p.y*.5,-p.y)-h.x*.5);}` },
  { id: 'sdCapsule',       label: 'Capsule',           params: ['vec3 p', 'vec3 a', 'vec3 b', 'float r'],
    code: `float sdCapsule(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}` },
  { id: 'sdVertCapsule',   label: 'Vertical Capsule',  params: ['vec3 p', 'float h', 'float r'],
    code: `float sdVertCapsule(vec3 p,float h,float r){p.y-=clamp(p.y,0.,h);return length(p)-r;}` },
  { id: 'sdCappedCylinder', label: 'Capped Cylinder',  params: ['vec3 p', 'float h', 'float r'],
    code: `float sdCappedCylinder(vec3 p,float h,float r){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}` },
  { id: 'sdRoundedCylinder', label: 'Rounded Cylinder', params: ['vec3 p', 'float ra', 'float rb', 'float h'],
    code: `float sdRoundedCylinder(vec3 p,float ra,float rb,float h){vec2 d=vec2(length(p.xz)-2.*ra+rb,abs(p.y)-h);return min(max(d.x,d.y),0.)+length(max(d,0.))-rb;}` },
  { id: 'sdCappedCone',    label: 'Capped Cone',       params: ['vec3 p', 'float h', 'float r1', 'float r2'],
    code: `float sdCappedCone(vec3 p,float h,float r1,float r2){vec2 q=vec2(length(p.xz),p.y);vec2 k1=vec2(r2,h),k2=vec2(r2-r1,2.*h),ca=vec2(q.x-min(q.x,(q.y<0.?r1:r2)),abs(q.y)-h),cb=q-k1+k2*clamp(dot(k1-q,k2)/dot(k2,k2),0.,1.);float s=(cb.x<0.&&ca.y<0.)?-1.:1.;return s*sqrt(min(dot(ca,ca),dot(cb,cb)));}` },
  { id: 'sdSolidAngle',    label: 'Solid Angle',       params: ['vec3 p', 'vec2 c', 'float ra'],
    code: `float sdSolidAngle(vec3 p,vec2 c,float ra){vec2 q=vec2(length(p.xz),p.y);float l=length(q)-ra,m=length(q-c*clamp(dot(q,c),0.,ra));return max(l,m*sign(c.y*q.x-c.x*q.y));}` },
  { id: 'sdCutSphere',     label: 'Cut Sphere',        params: ['vec3 p', 'float r', 'float h'],
    code: `float sdCutSphere(vec3 p,float r,float h){float w=sqrt(r*r-h*h);vec2 q=vec2(length(p.xz),p.y);float s=max((h-r)*q.x*q.x+w*w*(h+r-2.*q.y),(h*q.x-w*q.y));return (s<0.)?length(q)-r:((q.x<w)?h-q.y:length(q-vec2(w,h)));}` },
  { id: 'sdCutHollowSphere', label: 'Cut Hollow Sphere', params: ['vec3 p', 'float r', 'float h', 'float t'],
    code: `float sdCutHollowSphere(vec3 p,float r,float h,float t){float w=sqrt(r*r-h*h);vec2 q=vec2(length(p.xz),p.y);return ((h*q.x<w*q.y)?length(q-vec2(w,h)):abs(length(q)-r))-t;}` },
  { id: 'sdEllipsoid',     label: 'Ellipsoid',         params: ['vec3 p', 'vec3 r'],
    code: `float sdEllipsoid(vec3 p,vec3 r){float k0=length(p/r),k1=length(p/(r*r));return k0*(k0-1.)/k1;}` },
  { id: 'sdOctahedron',    label: 'Octahedron',        params: ['vec3 p', 'float s'],
    code: `float sdOctahedron(vec3 p,float s){p=abs(p);float m=p.x+p.y+p.z-s;vec3 q;if(3.*p.x<m)q=p.xyz;else if(3.*p.y<m)q=p.yzx;else if(3.*p.z<m)q=p.zxy;else return m*.57735;float k=clamp(.5*(q.z-q.y+s),0.,s);return length(vec3(q.x,q.y-s+k,q.z-k));}` },
  { id: 'sdOctahedronBound', label: 'Octahedron (bound)', params: ['vec3 p', 'float s'],
    code: `float sdOctahedronBound(vec3 p,float s){p=abs(p);return (p.x+p.y+p.z-s)*.57735027;}` },
  { id: 'sdPyramid',       label: 'Pyramid',           params: ['vec3 p', 'float h'],
    code: `float sdPyramid(vec3 p,float h){float m2=h*h+.25;p.xz=abs(p.xz);p.xz=(p.z>p.x)?p.zx:p.xz;p.xz-=.5;vec3 q=vec3(p.z,h*p.y-.5*p.x,h*p.x+.5*p.y);float s=max(-q.x,0.),t=clamp((q.y-.5*p.z)/(m2+.25),0.,1.);float a=m2*(q.x+s)*(q.x+s)+(q.y*q.y);float b=m2*(q.x+.5*t)*(q.x+.5*t)+(q.y-m2*t)*(q.y-m2*t);float d2=(min(q.y,-q.x*m2-q.y*.5)>0.)?0.:min(a,b);return sqrt((d2+q.z*q.z)/m2)*sign(max(q.z,-p.y));}` },
  { id: 'sdRhombus',       label: 'Rhombus',           params: ['vec3 p', 'float la', 'float lb', 'float h', 'float ra'],
    code: `float sdRhombus(vec3 p,float la,float lb,float h,float ra){p=abs(p);vec2 b=vec2(la,lb),f=clamp((ndot(b,b-2.*p.xz))/dot(b,b),-.5,.5);vec2 q=vec2(length(p.xz-b*vec2(.5-f,.5+f))*sign(p.x*b.y+p.z*b.x-b.x*b.y)-ra,p.y-h);return min(max(q.x,q.y),0.)+length(max(q,0.));}` },

  // ── 🆕 Phase 2 — primitives manquantes ───────────────────────────────────────

  { id: 'sdHeart',    label: 'Heart (XZ plane)',  params: ['vec3 p', 'float s', 'float h'],
    code: `float sdHeart(vec3 p,float s,float h){vec2 q=p.xz/s;q.x=abs(q.x);float d;if(q.x+q.y>1.0)d=length(q-vec2(.25,.75))-sqrt(.125);else d=sqrt(min(dot(q-vec2(0.,1.),q-vec2(0.,1.)),dot(q-.5*max(q.x+q.y,0.),q-.5*max(q.x+q.y,0.))))*sign(q.x-q.y);return length(vec2(d*s,max(abs(p.y)-h,0.)));}` },

  { id: 'sdBezier2D', label: 'Bézier Quad (XZ)',  params: ['vec3 p', 'vec2 A', 'vec2 B', 'vec2 C'],
    code: `float sdBezier2D(vec3 p,vec2 a,vec2 b,vec2 c){vec2 q=p.xz,A=b-a,B=a-2.*b+c,C=A*2.,D=a-q;float kk=1./dot(B,B),kx=kk*dot(A,B),ky=kk*(2.*dot(A,A)+dot(D,B))/3.,kz=kk*dot(D,A);float p2=ky-kx*kx,q2=kx*(2.*kx*kx-3.*ky)+kz,h=q2*q2+p2*p2*p2,res=0.,sgn=0.;if(h>=0.){float hz=sqrt(h);vec2 x=vec2(hz,-hz)-q2;float s=sign(x.x)*pow(abs(x.x)+1e-7,.333),t=sign(x.y)*pow(abs(x.y)+1e-7,.333),t2=clamp(s+t-kx,0.,1.);vec2 qi=D+(C+B*t2)*t2;res=dot(qi,qi);sgn=C.x*qi.y-C.y*qi.x;}else{float z=sqrt(-p2),v=acos(clamp(q2/(p2*z*2.),-1.,1.))/3.,m=cos(v),n2=sin(v)*1.732;vec3 tv=vec3(m+m,-n2-m,n2-m)*z-kx;float r0=0.,s0=0.;vec2 qi0=D+(C+B*clamp(tv.x,0.,1.))*clamp(tv.x,0.,1.);r0=dot(qi0,qi0);s0=C.x*qi0.y-C.y*qi0.x;vec2 qi1=D+(C+B*clamp(tv.y,0.,1.))*clamp(tv.y,0.,1.);if(dot(qi1,qi1)<r0){r0=dot(qi1,qi1);s0=C.x*qi1.y-C.y*qi1.x;}vec2 qi2=D+(C+B*clamp(tv.z,0.,1.))*clamp(tv.z,0.,1.);if(dot(qi2,qi2)<r0){r0=dot(qi2,qi2);s0=C.x*qi2.y-C.y*qi2.x;}res=r0;sgn=s0;}return sqrt(res)*sign(sgn);}` },
];

export const SDF_OPERATIONS = [
  { id: 'opUnion',           label: 'Union',              code: `float opUnion(float d1,float d2){return min(d1,d2);}` },
  { id: 'opSubtraction',     label: 'Subtraction',        code: `float opSubtraction(float d1,float d2){return max(-d1,d2);}` },
  { id: 'opIntersection',    label: 'Intersection',       code: `float opIntersection(float d1,float d2){return max(d1,d2);}` },
  { id: 'opSmoothUnion',     label: 'Smooth Union',       code: `float opSmoothUnion(float d1,float d2,float k){float h=clamp(.5+.5*(d2-d1)/k,0.,1.);return mix(d2,d1,h)-k*h*(1.-h);}` },
  { id: 'opSmoothSubtraction', label: 'Smooth Subtraction', code: `float opSmoothSubtraction(float d1,float d2,float k){float h=clamp(.5-.5*(d2+d1)/k,0.,1.);return mix(d2,-d1,h)+k*h*(1.-h);}` },
  { id: 'opSmoothIntersection', label: 'Smooth Intersection', code: `float opSmoothIntersection(float d1,float d2,float k){float h=clamp(.5-.5*(d2-d1)/k,0.,1.);return mix(d2,d1,h)+k*h*(1.-h);}` },
  { id: 'opTwist',           label: 'Twist',              code: `vec3 opTwist(vec3 p,float k){float c=cos(k*p.y),s=sin(k*p.y);mat2 m=mat2(c,-s,s,c);return vec3(m*p.xz,p.y);}` },
  { id: 'opCheapBend',       label: 'Cheap Bend',         code: `vec3 opCheapBend(vec3 p,float k){float c=cos(k*p.x),s=sin(k*p.x);mat2 m=mat2(c,-s,s,c);return vec3(m*p.xy,p.z);}` },
  { id: 'opRepeat',          label: 'Repetition',         code: `vec3 opRepeat(vec3 p,vec3 c){return mod(p+.5*c,c)-.5*c;}` },
  { id: 'opLimitedRepeat',   label: 'Limited Repetition', code: `vec3 opLimitedRepeat(vec3 p,float c,vec3 l){return p-c*clamp(round(p/c),-l,l);}` },
  { id: 'opScale',           label: 'Scale',              code: `float opScale(float d,float s){return d*s;}` },
  { id: 'opSymX',            label: 'Symmetry X',         code: `vec3 opSymX(vec3 p){return vec3(abs(p.x),p.yz);}` },
  { id: 'opSymXZ',           label: 'Symmetry XZ',        code: `vec3 opSymXZ(vec3 p){return vec3(abs(p.x),p.y,abs(p.z));}` },
  { id: 'opDisplace',        label: 'Displacement',       code: `float opDisplace(float d1,float d2){return d1+d2;}` },
  { id: 'opOnion',           label: 'Onion',              code: `float opOnion(float d,float t){return abs(d)-t;}` },
  { id: 'opExtrude',         label: 'Extrude (2D→3D)',    code: `float opExtrude(float d,float pz,float h){return length(vec2(d,max(abs(pz)-h,0.)));}` },
  { id: 'opRevolution',      label: 'Revolution (2D→3D)', code: `float opRevolution(float d,float px,float pz,float o){return length(vec2(length(vec2(px,pz))-o,d));}` },
  { id: 'opRound',           label: 'Round',              code: `float opRound(float d,float r){return d-r;}` },

  // ── 🆕 Phase 2 — opérations booléennes manquantes ────────────────────────────
  { id: 'opMorphBlend',      label: 'Morph Blend',        code: `float opMorphBlend(float d1,float d2,float t){return mix(d1,d2,clamp(t,0.,1.));}` },
];

export const SDF_EXTRAS = [
  { id: 'ndot', label: 'ndot helper', code: `float ndot(vec2 a,vec2 b){return a.x*b.x-a.y*b.y;}` },
  { id: 'dot2', label: 'dot2 helper', code: `float dot2(vec2 v){return dot(v,v);}float dot2(vec3 v){return dot(v,v);}` },
];

export function buildSdfSnippet(ids) {
  const all = [...SDF_EXTRAS, ...SDF_PRIMITIVES, ...SDF_OPERATIONS];
  const seen = new Set();
  const lines = [];
  for (const id of ids) {
    const entry = all.find(e => e.id === id);
    if (entry && !seen.has(id)) { seen.add(id); lines.push(entry.code); }
  }
  return lines.join('\n');
}

export function buildFullSdfLibrary() {
  return [
    ...SDF_EXTRAS.map(e => e.code),
    ...SDF_PRIMITIVES.map(e => e.code),
    ...SDF_OPERATIONS.map(e => e.code),
  ].join('\n');
}
