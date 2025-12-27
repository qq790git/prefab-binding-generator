# Prefab 绑定代码生成器

Cocos Creator 3.x 插件，自动为 Prefab 生成组件绑定代码。

## 支持的组件

- Label、Button、EditBox、Sprite、RichText
- Toggle、Slider、ProgressBar、ScrollView、PageView

## 安装

1. 复制 `prefab-binding-generator` 到项目 `extensions` 目录
2. 执行 `npm install && npm run build`
3. 在 Cocos Creator 扩展管理器中启用插件

## 使用

1. 菜单 `扩展 -> Prefab 绑定生成器`
2. 拖入 Prefab 文件
3. 点击生成,自动保存到Script/UI/Binding/目录下
4. 在需要使用绑定的脚本中引入生成的绑定类
    ```typescript
    import { MyPrefabBinding } from './UI/Binding/MyPrefabBinding';
    ```
5. 也可以右键Prefab,选择`生成绑定代码`

## 生成示例

```typescript
@ccclass('MyPrefabBinding')
export class MyPrefabBinding extends Component {

    private _title_label: Label | null = null;
    get title_label(): Label {
        if (!this._title_label) this._title_label = this.node.getChildByPath('title_label')?.getComponent(Label) ?? null;
        return this._title_label!;
    }
}
```
