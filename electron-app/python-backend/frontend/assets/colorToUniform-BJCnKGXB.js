import{c as z,d as W,n as I,w as k,G as w,f as O}from"./index-B2CJuAJd.js";let D=0;class E{constructor(t){this._poolKeyHash=Object.create(null),this._texturePool={},this.textureOptions=t||{},this.enableFullScreen=!1}createTexture(t,e,o){const n=new z({...this.textureOptions,width:t,height:e,resolution:1,antialias:o,autoGarbageCollect:!0});return new W({source:n,label:`texturePool_${D++}`})}getOptimalTexture(t,e,o=1,n){let s=Math.ceil(t*o-1e-6),i=Math.ceil(e*o-1e-6);s=I(s),i=I(i);const u=(s<<17)+(i<<1)+(n?1:0);this._texturePool[u]||(this._texturePool[u]=[]);let a=this._texturePool[u].pop();return a||(a=this.createTexture(s,i,n)),a.source._resolution=o,a.source.width=s/o,a.source.height=i/o,a.source.pixelWidth=s,a.source.pixelHeight=i,a.frame.x=0,a.frame.y=0,a.frame.width=t,a.frame.height=e,a.updateUvs(),this._poolKeyHash[a.uid]=u,a}getSameSizeTexture(t,e=!1){const o=t.source;return this.getOptimalTexture(t.width,t.height,o._resolution,e)}returnTexture(t){const e=this._poolKeyHash[t.uid];this._texturePool[e].push(t)}clear(t){if(t=t!==!1,t)for(const e in this._texturePool){const o=this._texturePool[e];if(o)for(let n=0;n<o.length;n++)o[n].destroy(!0)}this._texturePool={}}}const st=new E;function y(r,t,e){if(r)for(const o in r){const n=o.toLocaleLowerCase(),s=t[n];if(s){let i=r[o];o==="header"&&(i=i.replace(/@in\s+[^;]+;\s*/g,"").replace(/@out\s+[^;]+;\s*/g,"")),e&&s.push(`//----${e}----//`),s.push(i)}else k(`${o} placement hook does not exist in shader`)}}const L=/\{\{(.*?)\}\}/g;function j(r){var o;const t={};return(((o=r.match(L))==null?void 0:o.map(n=>n.replace(/[{()}]/g,"")))??[]).forEach(n=>{t[n]=[]}),t}function G(r,t){let e;const o=/@in\s+([^;]+);/g;for(;(e=o.exec(r))!==null;)t.push(e[1])}function _(r,t,e=!1){const o=[];G(t,o),r.forEach(u=>{u.header&&G(u.header,o)});const n=o;e&&n.sort();const s=n.map((u,a)=>`       @location(${a}) ${u},`).join(`
`);let i=t.replace(/@in\s+[^;]+;\s*/g,"");return i=i.replace("{{in}}",`
${s}
`),i}function R(r,t){let e;const o=/@out\s+([^;]+);/g;for(;(e=o.exec(r))!==null;)t.push(e[1])}function F(r){const e=/\b(\w+)\s*:/g.exec(r);return e?e[1]:""}function K(r){const t=/@.*?\s+/g;return r.replace(t,"")}function N(r,t){const e=[];R(t,e),r.forEach(a=>{a.header&&R(a.header,e)});let o=0;const n=e.sort().map(a=>a.indexOf("builtin")>-1?a:`@location(${o++}) ${a}`).join(`,
`),s=e.sort().map(a=>`       var ${K(a)};`).join(`
`),i=`return VSOutput(
                ${e.sort().map(a=>` ${F(a)}`).join(`,
`)});`;let u=t.replace(/@out\s+[^;]+;\s*/g,"");return u=u.replace("{{struct}}",`
${n}
`),u=u.replace("{{start}}",`
${s}
`),u=u.replace("{{return}}",`
${i}
`),u}function B(r,t){let e=r;for(const o in t){const n=t[o];n.join(`
`).length?e=e.replace(`{{${o}}}`,`//-----${o} START-----//
${n.join(`
`)}
//----${o} FINISH----//`):e=e.replace(`{{${o}}}`,"")}return e}const l=Object.create(null),U=new Map;let X=0;function Y({template:r,bits:t}){const e=A(r,t);if(l[e])return l[e];const{vertex:o,fragment:n}=J(r,t);return l[e]=H(o,n,t),l[e]}function q({template:r,bits:t}){const e=A(r,t);return l[e]||(l[e]=H(r.vertex,r.fragment,t)),l[e]}function J(r,t){const e=t.map(i=>i.vertex).filter(i=>!!i),o=t.map(i=>i.fragment).filter(i=>!!i);let n=_(e,r.vertex,!0);n=N(e,n);const s=_(o,r.fragment,!0);return{vertex:n,fragment:s}}function A(r,t){return t.map(e=>(U.has(e)||U.set(e,X++),U.get(e))).sort((e,o)=>e-o).join("-")+r.vertex+r.fragment}function H(r,t,e){const o=j(r),n=j(t);return e.forEach(s=>{y(s.vertex,o,s.name),y(s.fragment,n,s.name)}),{vertex:B(r,o),fragment:B(t,n)}}const Q=`
    @in aPosition: vec2<f32>;
    @in aUV: vec2<f32>;

    @out @builtin(position) vPosition: vec4<f32>;
    @out vUV : vec2<f32>;
    @out vColor : vec4<f32>;

    {{header}}

    struct VSOutput {
        {{struct}}
    };

    @vertex
    fn main( {{in}} ) -> VSOutput {

        var worldTransformMatrix = globalUniforms.uWorldTransformMatrix;
        var modelMatrix = mat3x3<f32>(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        var position = aPosition;

        {{start}}
        
        vColor = vec4<f32>(1., 1., 1., 1.);
        vUV = aUV;

        {{main}}

        var modelViewProjectionMatrix = globalUniforms.uProjectionMatrix * worldTransformMatrix * modelMatrix;

        vPosition =  vec4<f32>((modelViewProjectionMatrix *  vec3<f32>(position, 1.0)).xy, 0.0, 1.0);
       
        vColor *= globalUniforms.uWorldColorAlpha;

        {{end}}

        {{return}}
    };
`,V=`
    @in vUV : vec2<f32>;
    @in vColor : vec4<f32>;
   
    {{header}}

    @fragment
    fn main(
        {{in}}
      ) -> @location(0) vec4<f32> {
        
        {{start}}

        var outColor:vec4<f32>;
      
        {{main}}
        
        return outColor * vColor;
      };
`,Z=`
    in vec2 aPosition;
    in vec2 aUV;

    out vec4 vColor;
    out vec2 vUV;

    {{header}}

    void main(void){

        mat3 worldTransformMatrix = uWorldTransformMatrix;
        mat3 modelMatrix = mat3(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        vec2 position = aPosition;

        {{start}}
        
        vColor = vec4(1.);
        vUV = aUV;

        {{main}}

        mat3 modelViewProjectionMatrix = uProjectionMatrix * worldTransformMatrix * modelMatrix;

        gl_Position = vec4((modelViewProjectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);

        vColor *= uWorldColorAlpha;

        {{end}}
    }
`,tt=`
   
    in vec4 vColor;
    in vec2 vUV;

    out vec4 finalColor;

    {{header}}

    void main(void) {
        
        {{start}}

        vec4 outColor;
      
        {{main}}
        
        finalColor = outColor * vColor;
    }
`,et={name:"global-uniforms-bit",vertex:{header:`
        struct GlobalUniforms {
            uProjectionMatrix:mat3x3<f32>,
            uWorldTransformMatrix:mat3x3<f32>,
            uWorldColorAlpha: vec4<f32>,
            uResolution: vec2<f32>,
        }

        @group(0) @binding(0) var<uniform> globalUniforms : GlobalUniforms;
        `}},ot={name:"global-uniforms-bit",vertex:{header:`
          uniform mat3 uProjectionMatrix;
          uniform mat3 uWorldTransformMatrix;
          uniform vec4 uWorldColorAlpha;
          uniform vec2 uResolution;
        `}};function ut({bits:r,name:t}){const e=Y({template:{fragment:V,vertex:Q},bits:[et,...r]});return w.from({name:t,vertex:{source:e.vertex,entryPoint:"main"},fragment:{source:e.fragment,entryPoint:"main"}})}function ct({bits:r,name:t}){return new O({name:t,...q({template:{vertex:Z,fragment:tt},bits:[ot,...r]})})}const lt={name:"color-bit",vertex:{header:`
            @in aColor: vec4<f32>;
        `,main:`
            vColor *= vec4<f32>(aColor.rgb * aColor.a, aColor.a);
        `}},mt={name:"color-bit",vertex:{header:`
            in vec4 aColor;
        `,main:`
            vColor *= vec4(aColor.rgb * aColor.a, aColor.a);
        `}},S={};function rt(r){const t=[];{let e=0;for(let o=0;o<r;o++)t.push(`@group(1) @binding(${e++}) var textureSource${o+1}: texture_2d<f32>;`),t.push(`@group(1) @binding(${e++}) var textureSampler${o+1}: sampler;`)}return t.join(`
`)}function nt(r){const t=[];{t.push("switch vTextureId {");for(let e=0;e<r;e++)e===r-1?t.push("  default:{"):t.push(`  case ${e}:{`),t.push(`      outColor = textureSampleGrad(textureSource${e+1}, textureSampler${e+1}, vUV, uvDx, uvDy);`),t.push("      break;}");t.push("}")}return t.join(`
`)}function ht(r){return S[r]||(S[r]={name:"texture-batch-bit",vertex:{header:`
                @in aTextureIdAndRound: vec2<u32>;
                @out @interpolate(flat) vTextureId : u32;
            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1)
                {
                    vPosition = vec4<f32>(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
                }
            `},fragment:{header:`
                @in @interpolate(flat) vTextureId: u32;
    
                ${rt(16)}
            `,main:`
                var uvDx = dpdx(vUV);
                var uvDy = dpdy(vUV);
    
                ${nt(16)}
            `}}),S[r]}const M={};function at(r){const t=[];for(let e=0;e<r;e++)e>0&&t.push("else"),e<r-1&&t.push(`if(vTextureId < ${e}.5)`),t.push("{"),t.push(`	outColor = texture(uTextures[${e}], vUV);`),t.push("}");return t.join(`
`)}function vt(r){return M[r]||(M[r]={name:"texture-batch-bit",vertex:{header:`
                in vec2 aTextureIdAndRound;
                out float vTextureId;
              
            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1.)
                {
                    gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
                }
            `},fragment:{header:`
                in float vTextureId;
    
                uniform sampler2D uTextures[${r}];
              
            `,main:`
    
                ${at(16)}
            `}}),M[r]}const ft={name:"round-pixels-bit",vertex:{header:`
            fn roundPixels(position: vec2<f32>, targetSize: vec2<f32>) -> vec2<f32> 
            {
                return (floor((position * 0.5 + 0.5) * targetSize) / targetSize) * 2.0 - 1.0;
            }
        `}},pt={name:"round-pixels-bit",vertex:{header:`   
            vec2 roundPixels(vec2 position, vec2 targetSize)
            {       
                return (floor((position * 0.5 + 0.5) * targetSize) / targetSize) * 2.0 - 1.0;
            }
        `}},$={name:"local-uniform-bit",vertex:{header:`

            struct LocalUniforms {
                uTransformMatrix:mat3x3<f32>,
                uColor:vec4<f32>,
                uRound:f32,
            }

            @group(1) @binding(0) var<uniform> localUniforms : LocalUniforms;
        `,main:`
            vColor *= localUniforms.uColor;
            modelMatrix *= localUniforms.uTransformMatrix;
        `,end:`
            if(localUniforms.uRound == 1)
            {
                vPosition = vec4(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
            }
        `}},xt={...$,vertex:{...$.vertex,header:$.vertex.header.replace("group(1)","group(2)")}},dt={name:"local-uniform-bit",vertex:{header:`

            uniform mat3 uTransformMatrix;
            uniform vec4 uColor;
            uniform float uRound;
        `,main:`
            vColor *= uColor;
            modelMatrix = uTransformMatrix;
        `,end:`
            if(uRound == 1.)
            {
                gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
            }
        `}};class gt{constructor(){this.vertexSize=4,this.indexSize=6,this.location=0,this.batcher=null,this.batch=null,this.roundPixels=0}get blendMode(){return this.renderable.groupBlendMode}packAttributes(t,e,o,n){const s=this.renderable,i=this.texture,u=s.groupTransform,a=u.a,m=u.b,h=u.c,v=u.d,f=u.tx,p=u.ty,x=this.bounds,d=x.maxX,g=x.minX,b=x.maxY,P=x.minY,c=i.uvs,C=s.groupColorAlpha,T=n<<16|this.roundPixels&65535;t[o+0]=a*g+h*P+f,t[o+1]=v*P+m*g+p,t[o+2]=c.x0,t[o+3]=c.y0,e[o+4]=C,e[o+5]=T,t[o+6]=a*d+h*P+f,t[o+7]=v*P+m*d+p,t[o+8]=c.x1,t[o+9]=c.y1,e[o+10]=C,e[o+11]=T,t[o+12]=a*d+h*b+f,t[o+13]=v*b+m*d+p,t[o+14]=c.x2,t[o+15]=c.y2,e[o+16]=C,e[o+17]=T,t[o+18]=a*g+h*b+f,t[o+19]=v*b+m*g+p,t[o+20]=c.x3,t[o+21]=c.y3,e[o+22]=C,e[o+23]=T}packIndex(t,e,o){t[e]=o+0,t[e+1]=o+1,t[e+2]=o+2,t[e+3]=o+0,t[e+4]=o+2,t[e+5]=o+3}reset(){this.renderable=null,this.texture=null,this.batcher=null,this.batch=null,this.bounds=null}}function bt(r,t,e){const o=(r>>24&255)/255;t[e++]=(r&255)/255*o,t[e++]=(r>>8&255)/255*o,t[e++]=(r>>16&255)/255*o,t[e++]=o}export{gt as B,st as T,lt as a,$ as b,ut as c,bt as d,ct as e,mt as f,ht as g,vt as h,pt as i,dt as j,xt as l,ft as r};
//# sourceMappingURL=colorToUniform-BJCnKGXB.js.map
