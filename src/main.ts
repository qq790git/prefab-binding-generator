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

    // 第一遍：收集所有组件信息，统计简单名称出现次数
    const componentInfos: { path: string; nodeName: string; type: string; simpleProp: string }[] = [];
    const simpleNameCount = new Map<string, number>();
    
    data.forEach((item) => {
        if (!item.__type__ || !SUPPORTED_COMPONENTS.includes(item.__type__)) return;
        const nodeId = item.node?.__id__;
        if (nodeId === undefined) return;
        const node = nodes.get(nodeId);
        if (!node) return;

        const type = item.__type__.replace('cc.', '');
        const nodePath = getPath(nodeId);
        
        // 简单名称：节点名 + 组件类型
        let simpleProp = node.name.replace(/[^a-zA-Z0-9_]/g, '_');
        if (/^\d/.test(simpleProp)) simpleProp = '_' + simpleProp;
        simpleProp += '_' + type.charAt(0).toLowerCase() + type.slice(1);
        
        componentInfos.push({ path: nodePath, nodeName: node.name, type, simpleProp });
        simpleNameCount.set(simpleProp, (simpleNameCount.get(simpleProp) || 0) + 1);
    });
    
    // 第二遍：生成最终属性名
    const usedProps = new Map<string, number>();
    componentInfos.forEach((info) => {
        let finalProp: string;
        
        if (simpleNameCount.get(info.simpleProp)! > 1) {
            // 有重复，使用路径 + 序号
            let pathProp = info.path.replace(/[^a-zA-Z0-9_]/g, '_');
            if (/^\d/.test(pathProp)) pathProp = '_' + pathProp;
            pathProp += '_' + info.type.charAt(0).toLowerCase() + info.type.slice(1);
            
            const count = usedProps.get(pathProp) || 0;
            finalProp = count > 0 ? pathProp + '_' + count : pathProp;
            usedProps.set(pathProp, count + 1);
        } else {
            // 无重复，使用简单名称
            finalProp = info.simpleProp;
        }
        
        result.components.push({ path: info.path, node: info.nodeName, type: info.type, prop: finalProp });
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
