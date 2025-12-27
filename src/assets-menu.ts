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
        if (item.__type__ === 'cc.Node') {
            nodes.set(i, { name: item._name || 'Node', parent: item._parent?.__id__ ?? null });
        }
    });

    const getPath = (id) => {
        const paths = [];
        let cur = id;
        while (cur !== null) {
            const n = nodes.get(cur);
            if (!n) break;
            paths.unshift(n.name);
            cur = n.parent;
        }
        if (paths.length > 1) paths.shift();
        return paths.join('/');
    };

    data.forEach((item) => {
        if (!item.__type__ || !SUPPORTED_COMPONENTS.includes(item.__type__)) return;
        const nodeId = item.node?.__id__;
        if (nodeId === undefined) return;
        const node = nodes.get(nodeId);
        if (!node) return;

        const type = item.__type__.replace('cc.', '');
        let prop = node.name.replace(/[^a-zA-Z0-9_]/g, '_');
        if (/^\d/.test(prop)) prop = '_' + prop;
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
    // 生成私有缓存变量和 getter
    bindings.components.forEach((c) => {
        const privateName = '_' + c.prop;
        code += `    private ${privateName}: ${c.type} | null = null;\n`;
        code += `    get ${c.prop}(): ${c.type} {\n`;
        if (c.path) {
            code += `        if (!this.${privateName}) this.${privateName} = this.node.getChildByPath('${c.path}')?.getComponent(${c.type}) ?? null;\n`;
        } else {
            code += `        if (!this.${privateName}) this.${privateName} = this.node.getComponent(${c.type});\n`;
        }
        code += `        return this.${privateName}!;\n`;
        code += `    }\n\n`;
    });

    code += `}\n`;
    return code;
}

export function onAssetMenu(assetInfo) {
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
                } catch (e) {
                    console.error('生成绑定代码失败:', e);
                }
            }
        }
    ];
}
