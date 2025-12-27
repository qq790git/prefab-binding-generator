"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
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
const { ccclass, property } = _decorator;

@ccclass('${cls}')
export class ${cls} extends Component {
`;
    bindings.components.forEach((c) => {
        code += `    @property(${c.type})\n    ${c.prop}: ${c.type} = null!;\n\n`;
    });
    code += `    autoBindComponents() {\n`;
    bindings.components.forEach((c) => {
        code += c.path
            ? `        this.${c.prop} = this.node.getChildByPath('${c.path}')?.getComponent(${c.type})!;\n`
            : `        this.${c.prop} = this.node.getComponent(${c.type})!;\n`;
    });
    code += `    }\n}\n`;
    return code;
}
exports.methods = {
    openPanel() {
        Editor.Panel.open('prefab-binding-generator.default');
    },
    async generateBindingFromAsset(uuid) {
        try {
            const info = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
            if (!info) {
                console.error('无法获取资源信息');
                return;
            }
            // 检查是否是 Prefab 文件
            if (!info.file.endsWith('.prefab')) {
                console.warn('请选择 Prefab 文件');
                return;
            }
            const data = JSON.parse(fs.readFileSync(info.file, 'utf-8'));
            const prefabName = info.name.replace(/\.prefab$/i, '');
            const bindings = parsePrefab(data, prefabName);
            const code = generateCode(bindings, prefabName);
            // 保存到 assets/Script/UI/Binding 目录
            const projectPath = Editor.Project.path;
            const bindingDir = path.join(projectPath, 'assets', 'Script', 'UI', 'Binding');
            if (!fs.existsSync(bindingDir)) {
                fs.mkdirSync(bindingDir, { recursive: true });
            }
            const fileName = prefabName + 'Binding.ts';
            const outPath = path.join(bindingDir, fileName);
            fs.writeFileSync(outPath, code, 'utf-8');
            // 刷新资源
            Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/Script/UI/Binding/' + fileName);
            console.log('生成绑定代码成功:', outPath);
        }
        catch (e) {
            console.error('生成绑定代码失败:', e);
        }
    }
};
function load() {
    console.log('Prefab 绑定生成器插件已加载');
}
function unload() {
    console.log('Prefab 绑定生成器插件已卸载');
}
