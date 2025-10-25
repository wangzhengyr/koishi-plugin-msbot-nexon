import { Context, Logger } from 'koishi'
import type { Config } from '../config'
import { MapleClient } from '../api/client'
import { UserHistoryStore } from '../data/user-history'

interface BindCommandDeps {
  ctx: Context
  config: Config
  client: MapleClient
  history: UserHistoryStore
}

export function registerBindCommand(deps: BindCommandDeps) {
  const { ctx, config, client, history } = deps
  const bindLogger = new Logger('msbot-nexon:bind')

  ctx
    .command('tms/联盟绑定 [name:string]', '绑定或更新默认查询的角色')
    .alias('tms/联盟换绑')
    .example('tms/联盟绑定 青螃蟹GM')
    .action(async ({ session }, name) => {
      const userId = session?.userId
      const platform = session?.platform

      if (!userId || !platform) {
        return '当前会话无法识别用户，无法完成绑定。'
      }

      let candidate = name?.trim()
      if (!candidate) {
        await session?.send('请在下一条消息输入要绑定的角色名')
        const answer = await session?.prompt(60_000)
        if (!answer) {
          return '输入超时，请稍后重试。'
        }
        candidate = answer.trim()
      }

      if (!candidate) {
        return '角色名不能为空，请重新输入。'
      }

      try {
        const info = await client.fetchCharacterInfo(candidate)
        await history.remember(userId, platform, config.region, info.summary.name)
        return `角色 ${info.summary.name} 已绑定成功，后续可直接查询。`
      } catch (error) {
        bindLogger.warn(error as Error, '绑定角色失败 name=%s user=%s(%s)', candidate, userId, platform)
        return '角色不存在或暂时无法查询，请确认角色名是否正确。'
      }
    })
}
