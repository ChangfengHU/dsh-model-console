const ID = 'dsh-model-console-styles'

export function installStyles(): () => void {
  if (document.getElementById(ID)) return () => {}
  const style = document.createElement('style')
  style.id = ID
  style.textContent = `
.dmc-root{height:100%;overflow:auto;padding:28px 34px 60px;color:var(--foreground,#e8e8e8);background:var(--background,#171717);box-sizing:border-box}
.dmc-root *{box-sizing:border-box}.dmc-wrap{max-width:1040px;margin:0 auto}
.dmc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.dmc-head h2{font-size:28px;margin:0 0 7px}.dmc-head p,.dmc-muted{color:#929292;margin:0}
.dmc-btn{appearance:none;border:1px solid #454545;border-radius:9px;background:#252525;color:#ededed;padding:8px 13px;cursor:pointer;font:inherit}.dmc-btn:hover{background:#303030}.dmc-btn:disabled{opacity:.45;cursor:not-allowed}.dmc-primary{background:#f3f3f3;color:#171717;border-color:#f3f3f3}
.dmc-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:24px}.dmc-summary>div,.dmc-card{border:1px solid #343434;background:#202020;border-radius:14px}.dmc-summary>div{padding:15px}.dmc-summary small{display:block;color:#8f8f8f;margin-bottom:6px}.dmc-summary strong{font-size:16px}
.dmc-section-title{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8d8d8d;margin:24px 2px 10px}.dmc-card{margin-bottom:10px;overflow:hidden}
.dmc-default-card{display:grid;grid-template-columns:minmax(190px,1fr) minmax(250px,1.3fr) auto;align-items:center;gap:14px;padding:16px}.dmc-default-card>p{grid-column:1/-1;margin:0}
.dmc-row{width:100%;border:0;background:transparent;color:inherit;padding:16px;display:grid;grid-template-columns:42px 1fr auto;gap:13px;align-items:center;text-align:left}.dmc-row-actions{display:flex;gap:8px;align-items:center}.dmc-card>.dmc-success,.dmc-card>.dmc-error{margin:0;padding:0 16px 14px}
.dmc-logo{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-weight:750;background:#303030}.dmc-logo-codex{background:#f2f2f2;color:#161616}.dmc-logo-qwen{background:#6157ff;color:white}
.dmc-name{display:flex;gap:8px;align-items:center;font-weight:650}.dmc-meta{font-size:13px;color:#959595;margin-top:4px}.dmc-badge{font-size:11px;padding:3px 7px;border-radius:999px;background:#353535;color:#cfcfcf}.dmc-good{color:#80dca5;background:#1d3a29}.dmc-warn{color:#efc56b;background:#40351c}
.dmc-body{border-top:1px solid #343434;padding:16px}.dmc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dmc-fact{background:#181818;border:1px solid #303030;border-radius:10px;padding:12px}.dmc-fact small{display:block;color:#898989;margin-bottom:5px}
.dmc-models{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.dmc-model{font-size:12px;border:1px solid #3b3b3b;border-radius:999px;padding:5px 9px;background:#272727}.dmc-form{display:grid;gap:14px}.dmc-field{display:grid;gap:6px}.dmc-field label{font-size:13px;color:#bdbdbd}
.dmc-input,.dmc-select{width:100%;border:1px solid #454545;border-radius:9px;background:#171717;color:#ededed;padding:10px 11px;font:inherit}.dmc-actions{display:flex;justify-content:flex-end;gap:8px}.dmc-callout{border:1px solid #4b4126;background:#2e291b;color:#e7cd8b;border-radius:10px;padding:11px 13px;font-size:13px}
.dmc-error{color:#ff9d9d;font-size:13px}.dmc-success{color:#86dda8;font-size:13px}.dmc-provider-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dmc-provider{padding:11px;border:1px solid #333;border-radius:10px;background:#1b1b1b}.dmc-provider b{display:block}.dmc-provider small{color:#898989}
.dmc-foot{margin-top:20px;color:#858585;font-size:12px;line-height:1.6}.dmc-spinner{display:inline-block;width:13px;height:13px;border:2px solid #666;border-top-color:#fff;border-radius:50%;animation:dmc-spin .8s linear infinite}@keyframes dmc-spin{to{transform:rotate(360deg)}}
@media(max-width:720px){nav:has(~ div .dmc-root){display:none}nav:has(~ div .dmc-root)+div{width:100%;min-width:0}.dmc-root{padding:20px 16px 50px}.dmc-summary,.dmc-grid,.dmc-provider-list,.dmc-default-card{grid-template-columns:1fr}.dmc-head{align-items:center}.dmc-head h2{font-size:24px}.dmc-row{grid-template-columns:42px 1fr}.dmc-row-actions{grid-column:2;justify-self:start}.dmc-default-card>.dmc-btn{justify-self:start}}
`
  document.head.append(style)
  return () => { style.remove() }
}
