declare namespace Editor {
    namespace Panel {
        function open(panelName: string): void;
        function define(options: {
            template: string;
            style?: string;
            $?: Record<string, string>;
            ready?(): void;
            close?(): void;
            [key: string]: any;
        }): any;
    }

    namespace Message {
        function send(target: string, message: string, ...args: any[]): void;
        function request(target: string, message: string, ...args: any[]): Promise<any>;
    }

    namespace Project {
        const path: string;
    }
}
