const fs = require('fs');
const path = require('path');
const SUPPORTED_COMPONENTS = [
    'cc.Label', 'cc.Button', 'cc.EditBox', 'cc.Sprite',
    'cc.RichText', 'cc.Toggle', 'cc.Slider', 'cc.ProgressBar',
    'cc.ScrollView', 'cc.PageView'
];
function parsePrefab(data, name) {
    const result = { name, components: [] };
    const nodes = new Map();
    data.forEach((item, i) => {
        var _a, _b;
        if (item.__type__ === 'cc.Node') {
            nodes.set(i, { name: item._name || 'Node', parent: (_b = (_a = item._parent) === null || _a === void 0 ? void 0 : _a.__id__) !== null && _b !== void 0 ? _b : null });
        }
    });
    const getPath = (id) => {
        const paths = [];
        let cur = id;
        while (cur !== null) {
            const n = nodes.get(cur);
            if (!n)
                break;
            paths.unshift(n.name);
            cur = n.parent;
        }
        if (paths.length > 1)
            paths.shift();
        return paths.join('/');
    };
    data.forEach((item) => {
        var _a;
        if (!item.__type__ || !SUPPORTED_COMPONENTS.includes(item.__type__))
            return;
        const nodeId = (_a = item.node) === null || _a === void 0 ? void 0 : _a.__id__;
        if (nodeId === undefined)
            return;
        const node = nodes.get(nodeId);
        if (!node)
            return;
        const type = item.__type__.replace('cc.', '');
        let prop = node.name.replace(/[^a-zA-Z0-9_]/g, '_');
        if (/^\d/.test(prop))
            prop = '_' + prop;
        prop += '_' + type.charAt(0).toLowerCase() + type.slice(1);
        result.components.push({ path: getPath(nodeId), node: node.name, type, prop });
    });
    return result;
}
function generateCode(bindings, name) {
    const cls = name.replace(/[^a-zA-Z0-9]/g, '') + 'Binding';
    let code = `import { _decorator, Component, Label, Button, EditBox, Sprite, RichText, Toggle, Slider, ProgressBar, ScrollView, PageView } from 'cc';

@_decorator.ccclass('${cls}')
export class ${cls} extends Component {
`;
    bindings.components.forEach((c) => {
        const privateName = '_' + c.prop;
        code += `    private ${privateName}: ${c.type} | null = null;\n`;
        code += `    get ${c.prop}(): ${c.type} {\n`;
        if (c.path) {
            code += `        if (!this.${privateName}) this.${privateName} = this.node.getChildByPath('${c.path}')?.getComponent(${c.type}) ?? null;\n`;
        }
        else {
            code += `        if (!this.${privateName}) this.${privateName} = this.node.getComponent(${c.type});\n`;
        }
        code += `        return this.${privateName}!;\n`;
        code += `    }\n\n`;
    });
    code += `}\n`;
    return code;
}
module.exports = Editor.Panel.define({
    template: `
<div class="container">
    <div class="header">Prefab 绑定代码生成器</div>
    <div class="section">
        <label>选择 Prefab:</label>
        <ui-asset id="prefab-asset" droppable="cc.Prefab"></ui-asset>
    </div>
    <div class="section buttons">
        <ui-button id="btn-generate">生成绑定代码</ui-button>
        <ui-button id="btn-copy">复制到剪贴板</ui-button>
    </div>
    <div class="section">
        <label>组件列表:</label>
        <div id="component-list" class="list-box"></div>
    </div>
    <div class="section">
        <label>生成的代码:</label>
        <textarea id="code-output" readonly></textarea>
    </div>
    <div class="section">
        <label id="save-path"></label>
    </div>
</div>`,
    style: `
.container { padding: 10px; display: flex; flex-direction: column; height: 100%; }
.header { font-size: 16px; font-weight: bold; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #444; }
.section { margin-bottom: 10px; }
.section label { display: block; margin-bottom: 5px; }
.buttons ui-button { margin-right: 5px; }
.list-box { max-height: 120px; overflow-y: auto; background: #222; border: 1px solid #444; border-radius: 4px; padding: 5px; }
.comp-item { padding: 3px 5px; border-bottom: 1px solid #333; font-size: 12px; }
#code-output { width: 100%; height: 180px; background: #1a1a1a; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 11px; }
#save-path { color: #4a4; font-size: 12px; }`,
    $: {
        prefabAsset: '#prefab-asset',
        btnGenerate: '#btn-generate',
        btnCopy: '#btn-copy',
        componentList: '#component-list',
        codeOutput: '#code-output',
        savePath: '#save-path'
    },
    ready() {
        const self = this;
        this.$.btnGenerate.addEventListener('click', async () => {
            const uuid = self.$.prefabAsset.value;
            if (!uuid) {
                console.warn('请先选择 Prefab');
                return;
            }
            try {
                const info = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
                if (!info) {
                    console.error('无法获取 Prefab 信息');
                    return;
                }
                const data = JSON.parse(fs.readFileSync(info.file, 'utf-8'));
                const bindings = parsePrefab(data, info.name);
                self.$.componentList.innerHTML = bindings.components.length
                    ? bindings.components.map((c) => `<div class="comp-item"><b>${c.type}</b>: ${c.path || c.node} -> ${c.prop}</div>`).join('')
                    : '<div class="comp-item">未找到组件</div>';
                const code = generateCode(bindings, info.name);
                self.$.codeOutput.value = code;
                // 直接保存到 assets/Script/UI/Binding 目录
                const projectPath = Editor.Project.path;
                const bindingDir = path.join(projectPath, 'assets', 'Script', 'UI', 'Binding');
                // 确保目录存在
                if (!fs.existsSync(bindingDir)) {
                    fs.mkdirSync(bindingDir, { recursive: true });
                }
                // 移除可能的扩展名，只保留预制体名称
                const prefabName = info.name.replace(/\.prefab$/i, '');
                const fileName = prefabName + 'Binding.ts';
                const outPath = path.join(bindingDir, fileName);
                fs.writeFileSync(outPath, code, 'utf-8');
                self.$.savePath.textContent = '已保存: assets/Script/UI/Binding/' + fileName;
                // 刷新资源
                Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/Script/UI/Binding/' + fileName);
                console.log('生成并保存成功:', outPath);
            }
            catch (e) {
                console.error('生成失败:', e);
                self.$.savePath.textContent = '保存失败: ' + e.message;
            }
        });
        this.$.btnCopy.addEventListener('click', () => {
            const code = self.$.codeOutput.value;
            if (code) {
                navigator.clipboard.writeText(code);
                console.log('已复制到剪贴板');
            }
        });
    },
    close() { }
});
