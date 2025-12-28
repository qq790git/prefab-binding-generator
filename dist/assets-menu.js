"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAssetMenu = onAssetMenu;
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
    // 第一遍：收集所有组件信息，统计简单名称出现次数
    const componentInfos = [];
    const simpleNameCount = new Map();
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
        const nodePath = getPath(nodeId);
        // 简单名称：节点名 + 组件类型
        let simpleProp = node.name.replace(/[^a-zA-Z0-9_]/g, '_');
        if (/^\d/.test(simpleProp))
            simpleProp = '_' + simpleProp;
        simpleProp += '_' + type.charAt(0).toLowerCase() + type.slice(1);
        componentInfos.push({ path: nodePath, nodeName: node.name, type, simpleProp });
        simpleNameCount.set(simpleProp, (simpleNameCount.get(simpleProp) || 0) + 1);
    });
    // 第二遍：生成最终属性名
    const usedProps = new Map();
    componentInfos.forEach((info) => {
        let finalProp;
        if (simpleNameCount.get(info.simpleProp) > 1) {
            // 有重复，使用路径 + 序号
            let pathProp = info.path.replace(/[^a-zA-Z0-9_]/g, '_');
            if (/^\d/.test(pathProp))
                pathProp = '_' + pathProp;
            pathProp += '_' + info.type.charAt(0).toLowerCase() + info.type.slice(1);
            const count = usedProps.get(pathProp) || 0;
            finalProp = count > 0 ? pathProp + '_' + count : pathProp;
            usedProps.set(pathProp, count + 1);
        }
        else {
            // 无重复，使用简单名称
            finalProp = info.simpleProp;
        }
        result.components.push({ path: info.path, node: info.nodeName, type: info.type, prop: finalProp });
    });
    return result;
}
function generateCode(bindings, name) {
    const cls = name.replace(/[^a-zA-Z0-9]/g, '') + 'Binding';
    let code = `import { _decorator, Component, Label, Button, EditBox, Sprite, RichText, Toggle, Slider, ProgressBar, ScrollView, PageView } from 'cc';

@_decorator.ccclass('${cls}')
export class ${cls} extends Component {
`;
    // 生成私有缓存变量和 getter
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
function onAssetMenu(assetInfo) {
    if (!assetInfo.file || !assetInfo.file.endsWith('.prefab')) {
        return [];
    }
    return [
        {
            label: '生成绑定代码',
            click() {
                try {
                    const data = JSON.parse(fs.readFileSync(assetInfo.file, 'utf-8'));
                    const prefabName = assetInfo.name.replace(/\.prefab$/i, '');
                    const bindings = parsePrefab(data, prefabName);
                    const code = generateCode(bindings, prefabName);
                    const projectPath = Editor.Project.path;
                    const bindingDir = path.join(projectPath, 'assets', 'Script', 'UI', 'Binding');
                    if (!fs.existsSync(bindingDir)) {
                        fs.mkdirSync(bindingDir, { recursive: true });
                    }
                    const fileName = prefabName + 'Binding.ts';
                    const outPath = path.join(bindingDir, fileName);
                    fs.writeFileSync(outPath, code, 'utf-8');
                    Editor.Message.send('asset-db', 'refresh-asset', 'db://assets/Script/UI/Binding/' + fileName);
                    console.log('生成绑定代码成功:', outPath);
                }
                catch (e) {
                    console.error('生成绑定代码失败:', e);
                }
            }
        }
    ];
}
