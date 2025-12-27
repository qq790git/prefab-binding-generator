const fs = require('fs');
const path = require('path');

const SUPPORTED_COMPONENTS = [
    'cc.Label', 'cc.Button', 'cc.EditBox', 'cc.Sprite',
    'cc.RichText', 'cc.Toggle', 'cc.Slider', 'cc.ProgressBar',
    'cc.ScrollView', 'cc.PageView'
];

function parsePrefab(data: any[], name: string) {
    const result = { name, components: [] as any[] };
    const nodes = new Map();

    data.forEach((item, i) => {
        if (item.__type__ === 'cc.Node') {
            nodes.set(i, { name: item._name || 'Node', parent: item._parent?.__id__ ?? null });
        }
    });

    const getPath = (id: number) => {
        const paths: string[] = [];
        let cur: number | null = id;
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

function generateCode(bindings: any, name: string) {
    const cls = name.replace(/[^a-zA-Z0-9]/g, '') + 'Binding';
    let code = `import { _decorator, Component, Label, Button, EditBox, Sprite, RichText, Toggle, Slider, ProgressBar, ScrollView, PageView } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('${cls}')
export class ${cls} extends Component {
`;
    bindings.components.forEach((c: any) => {
        code += `    @property(${c.type})\n    ${c.prop}: ${c.type} = null!;\n\n`;
    });
    code += `    autoBindComponents() {\n`;
    bindings.components.forEach((c: any) => {
        code += c.path
            ? `        this.${c.prop} = this.node.getChildByPath('${c.path}')?.getComponent(${c.type})!;\n`
            : `        this.${c.prop} = this.node.getComponent(${c.type})!;\n`;
    });
    code += `    }\n}\n`;
    return code;
}

export const methods = {
    openPanel() {
        Editor.Panel.open('prefab-binding-generator.default');
    },

    async generateBindingFromAsset(uuid: string) {
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
        } catch (e) {
            console.error('生成绑定代码失败:', e);
        }
    }
};

export function load() {
    console.log('Prefab 绑定生成器插件已加载');
}

export function unload() {
    console.log('Prefab 绑定生成器插件已卸载');
}
