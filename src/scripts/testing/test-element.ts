import { Attribute, Component, OnInit, OnInitParam } from "../render-engine/component";

@Component({
  tag: 'nlib-test-element',
  useShadowDom: 'closed',
  html: /*html*/`
    <div [class]="this.wrapperClasses" *if="this.render">
      <div>Send by: {{this.username}}</div>
      <div class="render-time">Render time: {{renderTimeSeconds}}s</div>
    </div>
  `,
  style: /*css*/`
    .time-5 {
      color: red;
    }
  `,
})
export class InspirationElement implements OnInit {

  @Attribute({name: 'data-message-id', closest: true})
  public set msgId(msgId: string) {
    const majorVersion = Number(/^[0-9]+/.exec(game.version)[0]);
    if (majorVersion < 12) {
      this.username = game.messages.get(msgId).user.name;
    } else {
      this.username = game.messages.get(msgId).author.name;
    }
  }
  
  public render = false;
  public renderTimeStart: number;
  public renderTimeSeconds = 0;
  public wrapperClasses = '';
  public username: string;
  public onInit(args: OnInitParam): void {
    this.render = true;
    this.renderTimeStart = Date.now();
    const interval = setInterval(() => {
      this.renderTimeSeconds = Math.round((Date.now() - this.renderTimeStart) / 1000);
    }, 1000)
    const after5s = setTimeout(() => {
      this.wrapperClasses = 'time-5';
    }, 5000)
    args.addStoppable({stop: () => clearInterval(interval)});
    args.addStoppable({stop: () => clearTimeout(after5s)});
  }
}

Hooks.on('chatMessage', (chatLog: any, message: string, chatData: any) => {
  if (/^\/nlib(-test)?(\s|$)/.exec(message)) {
    // @ts-ignore
    ChatMessage.create({content: `<div data-nils-library-tag-replacer="nlib-test-element"></div>`})
    return false;
  }
})