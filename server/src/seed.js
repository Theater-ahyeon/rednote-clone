/**
 * 种子数据：默认账号 demo / 123456（其余账号同密码）
 * 说明：封面图优先使用 picsum 真实图片，断网时前端会自动回退到 server 生成的本地 SVG。
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, initSchema, UPLOADS } from './db.js';
import { hashPassword } from './utils/auth.js';
import { makeCover, makeAvatar, hashSeed } from './utils/placeholder.js';

const RESET = process.argv.includes('--reset');
initSchema();

if (RESET) {
  db.exec(`
    DELETE FROM messages; DELETE FROM comment_likes; DELETE FROM comments;
    DELETE FROM likes; DELETE FROM collects; DELETE FROM follows; DELETE FROM notes;
    DELETE FROM search_history; DELETE FROM hot_searches; DELETE FROM channels; DELETE FROM users;
  `);
  // 让 AUTOINCREMENT 的 id 重新从 1 开始，保证每次 reset 后的演示数据完全一致
  try {
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('users','notes','comments','messages')`).run();
  } catch {}
  try {
    fs.rmSync(path.join(UPLOADS, 'seed'), { recursive: true, force: true });
  } catch {}
  fs.mkdirSync(path.join(UPLOADS, 'seed'), { recursive: true });
}

// 简易确定性随机
let s = 20240617;
const rnd = () => {
  s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
  return s / 0xffffffff;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const CHANNELS = ['推荐', '穿搭', '美食', '彩妆', '影视', '职场', '情感', '家居', '游戏', '旅行', '健身', '数码', '手工', '学习'];

const HOT = [
  ['秋冬穿搭公式', 986000, '热'], ['citywalk路线推荐', 872000, ''], ['空气炸锅食谱', 764000, '爆'],
  ['早八人妆容', 653000, ''], ['深圳周末去哪儿', 587000, '新'], ['出租屋改造', 521000, ''],
  ['低成本变美', 476000, '热'], ['打工人午饭', 432000, ''], ['露营装备清单', 398000, ''],
  ['显白口红色号', 365000, '爆'], ['副业搞钱实录', 341000, '新'], ['新手健身计划', 312000, ''],
  ['猫咖探店', 287000, ''], ['考研倒计时', 265000, ''], ['东北旅游攻略', 243000, ''],
  ['通勤穿搭', 221000, ''], ['自制咖啡', 208000, ''], ['小户型收纳', 189000, ''],
  ['电影推荐', 167000, ''], ['学生党平价好物', 145000, '热']
];

const USERS = [
  ['demo', '一只小柚子', '记录生活里所有发光的小事 ✨ 合作私信', '广东', 'female'],
  ['achai', '阿柴的日常', '柴犬饲养员｜每天遛狗两万步', '北京', 'male'],
  ['xiaolu', '甜妹小鹿', '甜妹穿搭｜身高158 体重88', '上海', 'female'],
  ['shanye', '山野拾光', '周末在山上，周内在地铁上', '浙江', 'male'],
  ['chenchef', '陈老师的厨房', '十年厨师，教你把家常菜做到餐厅水准', '四川', 'male'],
  ['iverson', 'iverson的穿搭笔记', '男生穿搭｜cleanfit 爱好者', '广东', 'male'],
  ['mumu', '木木的家', '把出租屋，住成家的样子', '江苏', 'female'],
  ['worker', '打工人小陈', '互联网打工人｜记录工位与午饭', '北京', 'male'],
  ['catlady', '猫系女友', '两只布偶的铲屎官', '广东', 'female'],
  ['leo', '健身教练Leo', 'ACE认证｜帮你少走三年弯路', '山东', 'male'],
  ['travelbug', '旅行菌', '走过31个省，一直在路上', '云南', 'female'],
  ['moviezhou', '影视菌小周', '每周三更｜只聊值得看的', '北京', 'male'],
  ['afei', '数码阿飞', '数码测评｜只说自己买过的', '广东', 'male'],
  ['handmade', '手工耿的妹妹', '手作｜黏土｜羊毛毡', '重庆', 'female']
];

const NOTES = [
  [0, '周末去了趟郊区的营地，太治愈了', '第一次露营就选了对的地方！\n\n帐篷是朋友借的，天幕自己搭的，花了两个小时（主要是我看说明书看太久😂）。傍晚煮了一锅番茄牛腩，配着晚风吃，幸福感直接拉满。\n\n清单放在最后一张图了，新手照着买不会错～', ['露营', '周末去哪儿', '户外'], '深圳·光明农场', 600, 800],
  [1, '柴犬今天两岁了🎂', '从一个小毛球长成了……一个大毛球。\n\n两岁这天的仪式感：一块无糖鸡肉蛋糕，一根磨牙棒，还有我请的一下午假。', ['柴犬', '宠物', '日常'], '北京·朝阳', 600, 750],
  [2, '158小个子秋冬穿搭｜显高10cm公式', '姐妹们问了很多次的显高公式来了👇\n\n1️⃣ 短上衣+高腰裤，腰线提到肚脐以上\n2️⃣ 同色系从上到下，视觉拉长\n3️⃣ 鞋子选尖头/窄版，别选厚底圆头\n\n第4张是对比图，左边是我去年，右边是今年👀', ['穿搭', '小个子穿搭', '秋冬穿搭'], '上海·静安', 600, 900],
  [3, '四条citywalk路线，走过都说好', '整理了四条我反复走的路线：\n\n· 老城厢线：骑楼—老书店—糖水铺\n· 江景线：傍晚去，光线最好\n· 山腰线：有坡但值得\n· 菜市场线：最有人间烟火气\n\n每条都在 5km 以内，两小时走完。', ['citywalk', '旅行', '周末去哪儿'], '浙江·杭州', 600, 700],
  [4, '空气炸锅第一期：蜜汁鸡翅', '不用一滴油，外皮还脆。\n\n做法：\n1. 鸡翅两面划刀，生抽2勺 蚝油1勺 蜂蜜1勺 蒜末适量，腌 30 分钟\n2. 200度 12 分钟，翻面再 8 分钟\n3. 最后刷一层蜂蜜，200度 3 分钟上色\n\n家里小孩一次能吃六个🍗', ['空气炸锅', '美食', '家常菜'], '四川·成都', 600, 800],
  [5, '男生cleanfit｜三件单品搞定一周', '衣柜里 80% 的衣服其实是多余的。\n\n我的三件核心单品：\n· 白色重磅T（280g以上，不透）\n· 直筒深色牛仔裤\n· 灰色针织开衫\n\n互相组合就是一周，不用动脑。', ['穿搭', 'cleanfit', '男生穿搭'], '广东·深圳', 600, 800],
  [6, '出租屋改造第30天｜终于有家的样子', '预算 3800，全部来自二手市场和宜家折扣区。\n\n改动最大的三处：\n1. 换了暖光灯泡（3000K），氛围立刻不一样\n2. 加了一面纱帘，遮住房东的旧窗帘\n3. 地毯 + 落地灯 = 客厅的灵魂\n\n房东看图说：你走的时候能不能把家具留下😂', ['出租屋改造', '家居', '小户型'], '江苏·南京', 600, 800],
  [7, '打工人午饭｜15块能吃多好', '公司楼下这条街吃了两年，总结出性价比 TOP3：\n\n① 隆江猪脚饭 15r（加卤蛋 +2）\n② 麻辣烫自选 14r（少油多菜）\n③ 煲仔饭 16r（饭点要排队）\n\n第2张是今天这顿，14 块钱吃得很满足。', ['打工人午饭', '美食', '日常'], '北京·海淀', 600, 600],
  [8, '布偶猫的掉毛季，我认输了', '每天梳毛两次，家里还是有猫毛在飞。\n\n装备升级到第三代：\n· 针梳（表层浮毛）\n· 排梳（底层绒毛）\n· 除毛滚筒（沙发衣服）\n· 空气净化器（救命）\n\n猫：你继续。', ['猫', '宠物', '日常'], '广东·广州', 600, 800],
  [9, '新手健身前三个月，别做大重量', '见过太多新手第一个月就练伤的。\n\n前三个月的正确顺序：\n第1个月：学会呼吸和发力感，重量不重要\n第2个月：固定器械为主，找轨迹\n第3个月：再碰自由重量\n\n动作质量 > 重量，永远。', ['健身', '新手健身', '训练'], '山东·青岛', 600, 800],
  [10, '云南十日｜避开人潮的路线', '大理—沙溪—丽江—泸沽湖，反着走人最少。\n\n沙溪是我这趟最大的惊喜：古镇没被商业化，早上六点的集市能看到真正的生活。\n\n花费：人均 4200（含机票），详细账单在第 5 张图。', ['旅行', '云南', '攻略'], '云南·沙溪', 600, 900],
  [11, '今年看过最好的五部电影', '不剧透，只说为什么值得看：\n\n1. 关于时间和选择，看完沉默了十分钟\n2. 一部讲母亲的电影，我妈看完给我打了电话\n3. 视觉天花板，建议在最大的屏幕看\n4. 小成本，剧本扎实到每个配角都成立\n5. 关于"长大"，看完想给三年前的自己写封信', ['电影推荐', '影视', '观后感'], '北京·朝阳', 600, 750],
  [12, '用了半年的国产平板，说点实话', '不吹不黑，优点缺点都写：\n\n✅ 屏幕确实好，看PDF舒服\n✅ 续航一天半没问题\n❌ 手写笔延迟还是能感知到\n❌ 生态里好用的生产力应用偏少\n\n适合：看文档、追剧、记笔记\n不适合：当主力生产力工具', ['数码', '测评', '平板'], '广东·深圳', 600, 700],
  [13, '羊毛毡教程｜半小时做个小柿子', '第一次做的话建议从球形开始。\n\n材料：羊毛条3色、戳针、海绵垫\n要点：\n· 先戳成松球，再慢慢收紧表面\n· 表面不光滑就多戳几遍，别急\n· 叶子用绿色薄片，边缘戳薄一点\n\n做完挂包上，秋天氛围感就有了🍅', ['手工', '羊毛毡', '教程'], '重庆·渝中', 600, 800],
  [2, '平价口红试色｜黄皮友好的五支', '全部在 150 以下，黄一白试色。\n\n· 豆沙色：日常通勤不出错\n· 枫叶红：秋冬必备\n· 奶茶色：素颜也能涂\n· 正红：一支撑全场\n· 浆果色：显白第一名\n\n第3张是手臂试色，第4张是上嘴。', ['彩妆', '口红', '显白'], '上海·徐汇', 600, 900],
  [4, '三分钟搞定的早餐｜隔夜燕麦', '睡前五分钟，早上多睡二十分钟。\n\n配方：\n燕麦 40g + 牛奶 120ml + 奇亚籽 1勺 + 半根香蕉\n冷藏一夜，早上加坚果和蓝莓。\n\n口感像布丁，饱腹到中午。', ['早餐', '美食', '减脂'], '四川·成都', 600, 700],
  [6, '厨房收纳｜1㎡ 台面的极限利用', '厨房只有 3㎡，靠垂直空间救回来了。\n\n· 墙面挂杆：铲勺全上墙\n· 水槽下置物架：清洁剂分层\n· 冰箱侧磁吸收纳：保鲜膜/厨房纸\n\n改造前 vs 改造后在最后一张。', ['收纳', '家居', '厨房'], '江苏·南京', 600, 800],
  [3, '傍晚六点的江边，是一天里最好的光', '不用滤镜，手机直出。\n\n参数：ISO 100，1/250s，f/2.0\n时间：日落前 30 分钟\n位置：江边的第二个观景台，人少\n\n有时候觉得拍照的意义就是：让你重新看见习以为常的地方。', ['摄影', 'citywalk', '日常'], '浙江·杭州', 600, 600],
  [9, '深蹲膝盖疼？先看这三个原因', '深蹲膝盖疼 90% 不是膝盖的问题。\n\n1. 脚尖方向：应该和膝盖一致，别外八太多\n2. 重心：压在全脚掌，别翘脚尖\n3. 幅度：不是越深越好，先保证骨盆不翻转\n\n第2张是错误示范，别学。', ['健身', '深蹲', '膝盖'], '山东·青岛', 600, 800],
  [7, '工位改造｜把公司当成第二个家', '花了 400 块，工位成了全组最想蹭的地方。\n\n· 显示器支架 89r（颈椎救星）\n· 人体工学腰靠 129r\n· 桌面小绿植 39r\n· 静音键盘 149r（同事感谢我）\n\n幸福感和生产力真的正相关。', ['工位', '职场', '数码'], '北京·海淀', 600, 750],
  [10, '一个人旅行第五年，我学会的事', '不是鼓励孤独，是确认自己可以和自己相处。\n\n1. 住青旅的多人间，会遇到有趣的人\n2. 每天留两小时什么都不安排\n3. 拍一张有路人的照片，比风景更有故事\n4. 别把行程排满，留遗憾才有下次\n\n第4张是在沙溪遇到的老人，他请我喝了一杯茶。', ['旅行', '一个人旅行', '感悟'], '云南·大理', 600, 850],
  [8, '猫咖探店｜深圳这五家值得去', '按猫的幸福度排序（不是按装修）：\n\n① 猫的品种多，有独立休息区\n② 店员会讲每只猫的性格\n③ 猫可以自由回避客人（这点最重要）\n④ 有阳光房\n⑤ 咖啡意外的好喝\n\n探店时我最看重的：猫能不能躲起来。', ['猫咖', '探店', '深圳'], '广东·深圳', 600, 800],
  [0, '书桌改造｜预算800打造氛围感', '换了灯，换了桌垫，加了香薰。\n\n灯光是最值得投资的部分：\n· 主灯 4000K 中性光\n· 屏幕挂灯（不占桌面）\n· 背后一条灯带，晚上只开它\n\n现在每天坐到十一点都不想走。', ['书桌', '家居', '氛围感'], '广东·深圳', 600, 800],
  [5, '面试着装｜不用西装也能很专业', '互联网公司面试，穿得太正式反而扣分。\n\n安全牌：\n· 纯色衬衫 / 高领针织\n· 深色直筒裤\n· 干净的白色板鞋或乐福鞋\n\n重点不是贵，是合身和干净。', ['穿搭', '职场', '面试'], '广东·深圳', 600, 750],
  [11, '年度剧集｜这三部值得熬夜', '一部讲医生，一部讲律师，一部讲老师。\n\n共同点：都不是爽剧，但每一集都有让人记住的瞬间。\n\n第2部第9集我看了三遍。', ['追剧', '影视', '推荐'], '北京·朝阳', 600, 700],
  [12, '降噪耳机横评｜五款真实体验', '通勤、办公、飞机三种场景测。\n\n· 通勤：低频降噪强的赢\n· 办公：佩戴舒适度更重要\n· 飞机：续航和夹头力是关键\n\n综合推荐在第 5 张。', ['数码', '耳机', '测评'], '广东·深圳', 600, 800],
  [13, '黏土教程｜捏一只小熊', '材料很简单，主要是耐心。\n\n步骤：\n1. 身体先搓圆，再压出脸型\n2. 耳朵最后贴，位置要对称\n3. 用牙签划出毛流感\n4. 烤箱 130度 15 分钟定型\n\n做完送朋友，反应比买的礼物大十倍🐻', ['手工', '黏土', '教程'], '重庆·渝中', 600, 800],
  [1, '遛狗两万步，我瘦了八斤', '不是我遛狗，是狗遛我。\n\n每天路线：小区—公园—河堤—回家\n时间：早 40 分钟 + 晚 60 分钟\n\n柴犬的体力是个谜，它回家还要玩球。', ['柴犬', '健身', '日常'], '北京·朝阳', 600, 700],
  [4, '一锅出｜番茄牛腩面', '周末煮一大锅，够吃三天。\n\n关键两步：\n· 牛腩冷水下锅焯水，血沫去干净\n· 番茄分两次放：一半炖化，一半最后放保持形状\n\n汤色红亮，面条筋道，冬天来一碗太治愈。', ['美食', '面食', '家常菜'], '四川·成都', 600, 900],
  [2, '学生党平价护肤｜月均100的方案', '护肤不需要贵，需要稳定。\n\n早：温和洁面 + 保湿 + 防晒\n晚：卸妆 + 洁面 + 保湿\n\n防晒是最值得花钱的一步，别省。', ['护肤', '学生党', '平价'], '上海·静安', 600, 700],
  [6, '阳台改造｜从堆杂物到喝下午茶', '3㎡ 的阳台，现在是家里最抢手的位置。\n\n· 折叠小桌椅 299r\n· 户外地毯 89r\n· 三盆好养的植物（绿萝、龟背竹、薄荷）\n· 一串小灯\n\n周末在这里喝咖啡，一坐一下午。', ['阳台', '家居', '改造'], '江苏·南京', 600, 800],
  [3, '爬山装备｜别买贵的，买对的', '新手最容易买错的四样：\n\n❌ 专业登山鞋（城市周边用不上）\n❌ 大容量背包（装不满反而晃）\n❌ 冲锋衣（透气差，出汗更难受）\n❌ 登山杖（平路是负担）\n\n正确清单在第 3 张。', ['户外', '爬山', '装备'], '浙江·杭州', 600, 750],
  [9, '减脂期怎么吃｜不挨饿的配餐法', '减脂不是少吃，是会吃。\n\n一餐的结构：\n· 蛋白质：手掌大小一份\n· 碳水：拳头大小一份\n· 蔬菜：两拳头\n· 脂肪：拇指大小\n\n按这个比例吃，不饿也不胖。', ['健身', '减脂', '饮食'], '山东·青岛', 600, 800],
  [7, '远程办公一年｜真实的优缺点', '不是每个人都适合远程。\n\n优点：通勤归零、自己做午饭、专注度高\n缺点：边界模糊、容易过度工作、社交减少\n\n我的解法：固定下班时间 + 每天出门走一次。', ['职场', '远程办公', '感悟'], '北京·海淀', 600, 700],
  [10, '海边民宿｜开窗就是海', '淡季去的，一晚 320。\n\n选民宿的三个经验：\n1. 看差评，不看好评\n2. 问清是否真的"一线海景"\n3. 淡季去，价格差三倍\n\n早上被浪声叫醒的感觉，值。', ['旅行', '民宿', '海边'], '福建·霞浦', 600, 900],
  [8, '猫粮怎么选｜看懂配料表就够了', '不看广告，只看三行：\n\n1. 第一位必须是明确的肉类（不是"肉粉"）\n2. 粗蛋白 ≥ 35%（成猫）\n3. 无诱食剂、无不明油脂\n\n价格中等的那档通常最实在。', ['猫', '养猫', '知识'], '广东·广州', 600, 750],
  [0, '手冲咖啡入门｜器具清单', '入门不用买齐，三样就够：\n\n· 手冲壶（细嘴）\n· 滤杯 + 滤纸\n· 磨豆机（比豆子更重要）\n\n参数：15g 豆 / 225g 水 / 92度 / 2分30秒\n\n第4张是第一次成功的成品，很丑但很好喝。', ['咖啡', '手冲', '美食'], '广东·深圳', 600, 800],
  [5, '换季衣橱整理｜留下30件就够', '用一年没穿过的，就扔。\n\n我的判断标准：\n· 过去一年穿过吗？\n· 能和现有三件以上搭配吗？\n· 需要特殊打理吗？（需要就淘汰）\n\n整理完 68 件 → 31 件，早上选择困难消失了。', ['穿搭', '整理', '断舍离'], '广东·深圳', 600, 700],
  [11, '纪录片推荐｜看完想去看看世界', '五部，都是关于"人"的。\n\n第一部讲手艺，第二部讲迁徙，第三部讲海洋，第四部讲城市，第五部讲食物。\n\n周末看一部，比刷短视频舒服。', ['纪录片', '影视', '推荐'], '北京·朝阳', 600, 700],
  [12, '机械键盘入坑指南（劝退向）', '入坑两年，花了六千，说点真话。\n\n· 声音好听 ≠ 手感好\n· 客制化是个无底洞\n· 第一次买成品就够了\n\n如果你只是想打字舒服：一把 300 的足够。', ['数码', '键盘', '测评'], '广东·深圳', 600, 800],
  [13, '礼物包装｜让礼物贵十倍的方法', '包装比礼物本身更影响第一印象。\n\n· 素色纸 + 麻绳 + 一支干花\n· 颜色不超过三种\n· 手写卡片（字丑也没关系）\n\n第2张是我朋友的结婚礼物。', ['手工', '包装', '礼物'], '重庆·渝中', 600, 750],
  [1, '狗狗第一次剪指甲｜血泪教训', '第一次剪出血了，狗记住了，现在看到指甲剪就跑。\n\n正确做法：\n· 只剪透明部分的尖端\n· 一次剪一只，剪完给零食\n· 实在不行去医院，20 块钱搞定\n\n别硬来，信任比指甲重要。', ['宠物', '养狗', '知识'], '北京·朝阳', 600, 700],
  [4, '家常菜｜糖醋排骨零失败版本', '记住比例：1料酒 2酱油 3糖 4醋 5水\n\n按这个顺序下锅，不用调味道也能成。\n\n最后大火收汁时要看着锅，一走神就糊。', ['美食', '家常菜', '糖醋排骨'], '四川·成都', 600, 800],
  [2, '染发｜自己在家染的两年经验', '省钱但要谨慎。\n\n· 先做皮试，48 小时\n· 从发尾开始，最后上发根（头皮温度高上色快）\n· 别追求一次性到位，深色分两次\n\n第3张是翻车那次，橙色，别学。', ['彩妆', '染发', '变美'], '上海·徐汇', 600, 800],
  [6, '卧室灯光的三个层次', '一盏顶灯照亮房间，但毁掉氛围。\n\n正确是三层：\n· 环境光：吸顶灯/灯带\n· 任务光：床头阅读灯\n· 氛围光：小夜灯/香薰灯\n\n晚上只开氛围光，房间立刻高级了。', ['家居', '灯光', '氛围感'], '江苏·南京', 600, 700],
  [3, '骑行｜第一条30km路线', '新手友好，全程平路。\n\n沿江自行车道，红绿灯少，风景好。\n\n装备：头盔（必戴）+ 水 + 补胎工具\n时间：3小时（含拍照休息）', ['骑行', '户外', '运动'], '浙江·杭州', 600, 750],
  [9, '拉伸｜每天十分钟解决久坐酸痛', '按顺序做，每个动作 30 秒：\n\n1. 颈部侧屈\n2. 胸大肌门框拉伸\n3. 猫牛式\n4. 髋屈肌弓步拉伸\n5. 腘绳肌坐姿前屈\n\n第3张是标准动作图示。', ['健身', '拉伸', '久坐'], '山东·青岛', 600, 800],
  [10, '古镇｜商业化之前赶紧去', '早上六点，游客还没来。\n\n青石板是湿的，店铺还没开门，只有扫地的大爷和煮早点的阿姨。\n\n这才是古镇本来的样子。', ['旅行', '古镇', '摄影'], '云南·丽江', 600, 900],
  [7, '效率工具｜我用过的四个笔记软件', '换过很多，最后留下两个。\n\n评判标准：\n· 打开速度（慢就不用）\n· 搜索能力（找不到等于没记）\n· 同步稳定性\n\n结论在第 4 张表。', ['职场', '效率', '工具'], '北京·海淀', 600, 700],
  [8, '猫的15个肢体语言', '尾巴、耳朵、瞳孔都在说话。\n\n· 尾巴竖起尖端弯：开心打招呼\n· 耳朵向后压：害怕或生气\n· 缓慢眨眼：信任你\n· 露出肚皮：不一定要摸\n\n第5张最容易被误解。', ['猫', '养猫', '知识'], '广东·广州', 600, 800]
];

const COMMENTS = [
  '太喜欢了！收藏起来慢慢看 😍', '这个我也想试试，蹲个教程', '姐妹拍得好好看呀', '救命 我刚好需要这个', '已收藏，谢谢博主分享',
  '求个链接呀 🙋', '看着就很有氛围感', '第一次看到这么详细的，爱了', '我也是这么做的！', '周末就去打卡',
  '博主是懂生活的', '学到了学到了', '这个配色绝了', '有点想哭，写得太好了', '马住马住',
  '请问预算大概多少呀', '照着做了一遍，成功了！', '这才是小红书该有的内容', '每次看到你的笔记都很治愈', '我也想去 🥺'
];

function run() {
  const now = Date.now();
  const insertUser = db.prepare(
    `INSERT INTO users (username, password, nickname, avatar, bio, ip_location, gender, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const userIds = USERS.map(([username, nickname, bio, ip, gender]) => {
    const info = insertUser.run(
      username,
      hashPassword('123456'),
      nickname,
      makeAvatar(username, nickname.slice(0, 1)),
      bio,
      ip,
      gender,
      now - int(30, 300) * 86400000
    );
    return Number(info.lastInsertRowid);
  });

  const insertNote = db.prepare(
    `INSERT INTO notes (user_id, title, content, images, topics, location, like_count, collect_count, comment_count, view_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const noteIds = NOTES.map((n, i) => {
    const [ui, title, content, topics, location, w, h] = n;
    const imgCount = int(2, 6);
    const images = Array.from({ length: imgCount }, (_, k) => {
      const seed = `${title}-${i}-${k}`;
      const hh = Math.round(h * (0.92 + rnd() * 0.16));
      const local = makeCover(seed, w, hh);
      return {
        url: `https://picsum.photos/seed/${Math.abs(hashSeed(seed))}/${w}/${hh}`,
        fallback: local,
        w,
        h: hh
      };
    });
    const createdAt = now - int(1, 45) * 3600000 * (1 + int(0, 20));
    const info = insertNote.run(
      userIds[ui],
      title,
      content,
      JSON.stringify(images),
      JSON.stringify(topics),
      location,
      0,
      0,
      0,
      0,
      createdAt
    );
    return Number(info.lastInsertRowid);
  });

  // 评论
  const insertComment = db.prepare(
    `INSERT INTO comments (note_id, user_id, parent_id, content, like_count, ip_location, created_at) VALUES (?,?,?,?,?,?,?)`
  );
  const userRows = db.prepare('SELECT * FROM users').all();
  noteIds.forEach((nid) => {
    const count = int(1, 5);
    const used = new Set();
    for (let i = 0; i < count; i++) {
      const u = userRows[int(0, userRows.length - 1)];
      if (used.has(u.id)) continue;
      used.add(u.id);
      const cid = insertComment.run(nid, u.id, null, pick(COMMENTS), int(0, 320), u.ip_location, now - int(1, 20) * 3600000)
        .lastInsertRowid;
      if (rnd() > 0.6) {
        const u2 = userRows[int(0, userRows.length - 1)];
        insertComment.run(nid, u2.id, Number(cid), pick(COMMENTS), int(0, 40), u2.ip_location, now - int(1, 10) * 3600000);
      }
    }
    const cc = db.prepare('SELECT COUNT(*) c FROM comments WHERE note_id = ?').get(nid).c;
    db.prepare('UPDATE notes SET comment_count = ? WHERE id = ?').run(cc, nid);
  });

  // 关注关系（demo 关注 6 人，其余互相随机）
  const insertFollow = db.prepare(
    'INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?,?,?)'
  );
  userIds.forEach((uid, idx) => {
    const targets = userIds.filter((_, j) => j !== idx);
    const n = idx === 0 ? 7 : int(2, 8);
    for (let i = 0; i < n; i++) insertFollow.run(uid, targets[int(0, targets.length - 1)], now);
  });
  db.prepare('UPDATE users SET following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = users.id)').run();
  db.prepare('UPDATE users SET follower_count = (SELECT COUNT(*) FROM follows WHERE followee_id = users.id)').run();

  // 点赞 / 收藏
  const insertLike = db.prepare('INSERT OR IGNORE INTO likes (user_id, note_id, created_at) VALUES (?,?,?)');
  const insertCollect = db.prepare('INSERT OR IGNORE INTO collects (user_id, note_id, created_at) VALUES (?,?,?)');
  noteIds.forEach((nid) => {
    const base = int(20, 2600);
    const lc = Math.round(base * (0.2 + rnd() * 0.4));
    db.prepare('UPDATE notes SET like_count = ?, collect_count = ?, view_count = ? WHERE id = ?').run(
      base,
      lc,
      base * int(8, 22),
      nid
    );
    for (let i = 0; i < 3; i++) insertLike.run(userIds[int(0, userIds.length - 1)], nid, now);
    if (rnd() > 0.5) insertCollect.run(userIds[int(0, userIds.length - 1)], nid, now);
  });
  // 保证 demo 账号有已点赞/已收藏的笔记，方便演示"已选状态"
  noteIds.slice(0, 5).forEach((nid) => insertLike.run(userIds[0], nid, now));
  noteIds.slice(2, 6).forEach((nid) => insertCollect.run(userIds[0], nid, now));

  // 消息
  const insertMsg = db.prepare(
    'INSERT INTO messages (box, from_user_id, to_user_id, note_id, content, created_at, read) VALUES (?,?,?,?,?,?,?)'
  );
  const demo = userIds[0];
  for (let i = 1; i <= 6; i++) {
    insertMsg.run('likes', userIds[i % userIds.length], demo, noteIds[int(0, noteIds.length - 1)], '赞了你的笔记', now - i * 3600000, i > 3 ? 0 : 1);
    insertMsg.run('follows', userIds[(i * 2) % userIds.length], demo, null, '关注了你', now - i * 7200000, i > 2 ? 0 : 1);
    insertMsg.run('comments', userIds[(i * 3) % userIds.length], demo, noteIds[int(0, noteIds.length - 1)], pick(COMMENTS), now - i * 5400000, i > 4 ? 0 : 1);
  }

  // 热搜 & 频道
  const insHot = db.prepare('INSERT INTO hot_searches (keyword, heat, tag) VALUES (?,?,?)');
  HOT.forEach(([k, h, t]) => insHot.run(k, h, t));
  const insCh = db.prepare('INSERT INTO channels (name, sort) VALUES (?,?)');
  CHANNELS.forEach((c, i) => insCh.run(c, i));

  db.prepare('UPDATE users SET like_collect_count = (SELECT COUNT(*) FROM likes WHERE user_id = users.id) + (SELECT COUNT(*) FROM collects WHERE user_id = users.id)').run();

  const counts = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    notes: db.prepare('SELECT COUNT(*) c FROM notes').get().c,
    comments: db.prepare('SELECT COUNT(*) c FROM comments').get().c,
    likes: db.prepare('SELECT COUNT(*) c FROM likes').get().c
  };
  console.log('✅ 种子数据写入完成:', counts);
  console.log('   体验账号：demo / 123456（其余 13 个账号密码相同）');
}

run();
