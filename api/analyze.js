export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, type, castData, customerData, salesData, storeData, trendsData, shiftData, attendanceData, visitsData, storeInfo } = req.body;

    // ── 共有コンテキスト（全カテゴリ共通） ──────────────────────────────
    const si = storeInfo || {};
    const _today = new Date();
    const _month = _today.getMonth() + 1;
    const _day   = _today.getDate();

    const MONTHLY_KB = {
      1:  { season:'新年会シーズン',       chars:['年始ダッシュが売上を左右する','ボーナス残りで太客が動く時期','新年会需要が最高潮'] },
      2:  { season:'バレンタイン前後',     chars:['バレンタイン（14日）前後が月最大の山場','月後半は閑散期入りに注意','カップル客・プレゼント需要が高まる'] },
      3:  { season:'卒業・歓送迎会シーズン', chars:['新規客獲得の大チャンス','異動・退職する常連客のフォロー最重要','来店予定の積み増しを今月中に'] },
      4:  { season:'新年度・歓迎会シーズン', chars:['新入社員による新規客の波','歓迎会需要で客数が増えやすい','年度始めの好調を次月以降につなげる仕込みの時期'] },
      5:  { season:'GWシーズン',           chars:['GW前後の週末は集客チャンス','GW中は観光・帰省で動きが読みにくい','月後半は通常ペースに戻る'] },
      6:  { season:'閑散期（梅雨）',       chars:['業界全体で来客が落ちやすい','梅雨で外出が減る','顧客維持と来店予定の積み上げが最重要','採用・育成に集中するタイミング'] },
      7:  { season:'夏・ボーナスシーズン', chars:['夏ボーナスで太客が動く','暑気払い需要で来店が増えやすい','七夕・浴衣などの夏イベントが盛り上がる'] },
      8:  { season:'お盆シーズン',         chars:['お盆前（前半）は来客増加傾向','お盆中は帰省の影響で閑散する地域もある','キャストのお盆休みによるシフト管理が重要'] },
      9:  { season:'閑散期（秋入り）',     chars:['業界全体で来客が落ちやすい','年末に向けた仕込みの時期','採用強化・新キャスト育成の好機'] },
      10: { season:'ハロウィンシーズン',   chars:['ハロウィン（31日）は最大の集客チャンス','衣装・仮装イベントで単価が上がりやすい','年末商戦への助走として重要'] },
      11: { season:'年末準備シーズン',     chars:['忘年会の予約が入り始める','12月来店予定の獲得が最最重要','閑散からの回復期で仕掛けが大切'] },
      12: { season:'忘年会・クリスマス（最繁忙期）', chars:['業界最大の繁忙期','忘年会需要で客数・単価ともに最高値になりやすい','クリスマスイブ（24日）は特別高単価','年間売上の20〜30%がこの月に集中することも'] },
    };
    const _mc = MONTHLY_KB[_month] || { season:'', chars:[] };

    const ANNUAL_EV = [
      {m:1,d:1,n:'元旦・新年'},{m:2,d:3,n:'節分'},{m:2,d:14,n:'バレンタインデー'},
      {m:3,d:14,n:'ホワイトデー'},{m:5,d:3,n:'ゴールデンウィーク'},{m:7,d:7,n:'七夕'},
      {m:8,d:15,n:'お盆'},{m:10,d:31,n:'ハロウィン'},{m:12,d:24,n:'クリスマスイブ'},
      {m:12,d:25,n:'クリスマス'},{m:12,d:31,n:'大晦日'},
    ];
    const _evList = [];
    ANNUAL_EV.forEach(ev => {
      let evD = new Date(_today.getFullYear(), ev.m-1, ev.d);
      if (evD < _today) evD = new Date(_today.getFullYear()+1, ev.m-1, ev.d);
      const du = Math.floor((evD - _today) / 86400000);
      if (du <= 30) _evList.push(ev.n + '（' + du + '日後）');
    });
    if (si.openDate) {
      const op = si.openDate.split('-');
      let an = new Date(_today.getFullYear(), Number(op[1])-1, Number(op[2]));
      if (an < _today) an = new Date(_today.getFullYear()+1, Number(op[1])-1, Number(op[2]));
      const du = Math.floor((an - _today) / 86400000);
      if (du <= 30) _evList.push('店舗' + (an.getFullYear() - Number(op[0])) + '周年★（' + du + '日後）');
    }

    const _storeLines = [
      si.area       ? 'エリア：' + si.area : null,
      si.mainGuest  ? '主な客層：' + si.mainGuest : null,
      si.freeRate   ? 'フリー率：' + si.freeRate : null,
      si.policy     ? '店舗方針：' + si.policy : null,
      si.openDate   ? '開店日：' + si.openDate : null,
    ].filter(Boolean);

    const sharedCtx = [
      '【現在の時期・キャバクラ業界動向】',
      _today.getFullYear() + '年' + _month + '月' + _day + '日 ／ 時期：' + _mc.season,
      _mc.chars.map(c => '・' + c).join('\n'),
      _evList.length ? '\n直近30日以内のイベント：\n' + _evList.map(e => '・' + e).join('\n') : '',
      _storeLines.length ? '\n【店舗情報】\n' + _storeLines.join('\n') : '',
      si.area ? '\n【エリア特性の活用】\nエリア「' + si.area + '」について、あなたが知っている以下の観点を分析に反映してください：\n・そのエリアの客層の傾向（年齢層・職種・消費傾向）\n・競合環境（キャバクラ激戦区か否か・価格帯の相場）\n・エリアの人の流れ・繁忙時間帯・曜日特性\n・そのエリアならではの集客チャンスや注意点' : '',
    ].filter(Boolean).join('\n');
    // ─────────────────────────────────────────────────────────────────────

    let systemPrompt = '';

    if (type === 'store-sales') {

      const sd = salesData || {};
      const dow = ['日','月','火','水','木','金','土'];

      const dowBlock = (sd.byDayOfWeek || []).map(d =>
        '・' + dow[d.day] + '曜：平均売上¥' + (d.avgSales||0).toLocaleString()
        + ' / 平均客数' + (d.avgGuests||0) + '人'
        + ' / 目標シフト' + d.quota + '人 実績' + (d.avgShifts||0) + '人'
        + '（' + d.count + '日分）'
      ).join('\n');

      const weekBlock = (sd.recentWeeks || []).map(w =>
        '・' + w.week + '：売上¥' + (w.sales||0).toLocaleString() + ' / 客数' + (w.guests||0) + '人'
      ).join('\n');

      const castBlock = (sd.casts || []).map(c => {
        const pct = c.achieveRate !== null ? c.achieveRate + '%' : '-';
        const mom = c.lastMonthSales ? Math.round(c.sales / c.lastMonthSales * 100) + '%' : '-';
        return '・' + c.name + (c.isDispatch ? '（派遣）' : '')
          + '：¥' + (c.sales||0).toLocaleString()
          + (c.target ? '（目標¥' + c.target.toLocaleString() + ' / 達成率' + pct + '）' : '')
          + ' 出勤' + c.workDays + '日'
          + ' 1出勤¥' + (c.salesPerDay||0).toLocaleString()
          + ' 指名' + c.nominations + '組 同伴' + c.companions + '回'
          + (c.lastMonthSales ? ' 前月比' + mom : '');
      }).join('\n');

      const dataBlock = [
        '【店舗売上データ】',
        '対象期間：' + (sd.yearMonth || ''),
        '月間売上：¥' + (sd.totalSales||0).toLocaleString(),
        sd.lastMonthSales ? '前月売上：¥' + sd.lastMonthSales.toLocaleString() : null,
        sd.momRate    ? '前月比：' + sd.momRate + '%' : null,
        '営業日数：' + (sd.workingDays||0) + '日',
        '月間客数：' + (sd.totalGuests||0) + '人',
        '月間同伴数：' + (sd.totalCompanions||0) + '回',
        '月間指名組数：' + (sd.totalNominations||0) + '組',
        '月間場内組数：' + (sd.totalFloorCount||0) + '組',
        '日平均売上：¥' + (sd.avgSalesPerDay||0).toLocaleString(),
        '客単価（AVG）：¥' + (sd.avgPerGuest||0).toLocaleString(),
        '',
        '【曜日別パフォーマンス】',
        dowBlock,
        '',
        '【週次推移（直近）】',
        weekBlock,
        '',
        '【キャスト別今月実績（売上順）】',
        castBlock || '　データなし'
      ].filter(Boolean).join('\n');

      systemPrompt = [
        'あなたはキャバクラ店舗の売上分析を専門とするAIです。',
        '週次レビューとして、今週の振り返りと来週に向けた具体的なアクションを提案してください。',
        '現在の時期・店舗特性・業界動向も踏まえて分析してください。',
        '',
        sharedCtx,
        '',
        '【業界知識・前提】',
        '・客数が全ての根本。客が入らない店に売上は伸びない',
        '・週末（特に金曜）は最も攻める日。休み前日が最も集客しやすい',
        '・守りに入ると売上は確実に落ちる。常に攻める姿勢を基本とする',
        '・AVGが低い日は客数が多くても利益構造が弱い可能性がある',
        '・シフト過多の日はコスト圧迫、不足の日は機会損失の可能性がある',
        '',
        '【分析の視点】',
        '■ 今週の振り返り',
        '  直近の週次推移から今週のパフォーマンスを評価する',
        '  月次目標に対して今週時点でどの程度進んでいるかを確認する',
        '',
        '■ 曜日別パターン',
        '  強い曜日・弱い曜日を特定し、来週の集客施策に活かす',
        '',
        '■ 客数とAVGの関係',
        '  客数↑AVG↓ → 薄い客が多い、単価向上施策が必要',
        '  客数↓AVG↑ → 太客への依存、新規集客が必要',
        '  両方↓ → 集客から立て直しが最優先',
        '',
        '■ 来週注力すべきキャスト',
        '  今週の結果を踏まえ、来週に向けてマネージャーが声をかけるべきキャストを最大5名ピックアップする',
        '  選定基準：1出勤あたり売上が高い・指名が増えている・目標未達で出勤が少ないなど',
        '  各キャストへの来週中に動けるアクション（声がけ・シフト打診・同伴促進など）を1〜2行で示す',
        '',
        '【判断の原則】',
        '・データが不足している場合は「データ不足」と明記する',
        '・断定を避ける。「〜の可能性があります」「〜を検討してください」で提示する',
        '・数字の羅列ではなく、マネージャーが来週すぐ動けるアクションベースで答える',
        '',
        '【回答フォーマット】',
        '1. 今週の総合評価（月次目標進捗を含め2〜3行）',
        '2. 今週の強みと課題（曜日・客数・AVGの観点で）',
        '3. 来週注力すべきキャスト（名前・理由・具体的アクションをセットで、最大5名）',
        '4. 来週のアクションプラン（集客・シフト・キャスト育成の観点で）',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        dataBlock
      ].join('\n');

    } else if (type === 'ai-trends') {

      const td = trendsData || {};
      const profiles = td.castProfiles || [];

      const typeGroups = {};
      profiles.forEach(p => {
        const t = p.castType || '未設定';
        if (!typeGroups[t]) typeGroups[t] = { count:0, totalSales:0, totalNoms:0 };
        typeGroups[t].count++;
        typeGroups[t].totalSales += p.avgMonthlySales;
        typeGroups[t].totalNoms += p.avgNominations;
      });
      const typeBlock = Object.keys(typeGroups).map(t => {
        const g = typeGroups[t];
        return '・' + t + '：' + g.count + '名'
          + ' / 平均月売上¥' + Math.round(g.totalSales/g.count).toLocaleString()
          + ' / 平均月指名' + Math.round(g.totalNoms/g.count) + '組';
      }).join('\n');

      const ageGroups = {'18-20':{count:0,sales:0},'21-23':{count:0,sales:0},'24-26':{count:0,sales:0},'27-29':{count:0,sales:0},'30+':{count:0,sales:0}};
      profiles.forEach(p => {
        if (p.age === null) return;
        const age = p.age;
        const g = age<=20?'18-20':age<=23?'21-23':age<=26?'24-26':age<=29?'27-29':'30+';
        ageGroups[g].count++; ageGroups[g].sales += p.avgMonthlySales;
      });
      const ageBlock = Object.keys(ageGroups)
        .filter(k => ageGroups[k].count > 0)
        .map(k => {
          const g = ageGroups[k];
          return '・' + k + '歳：' + g.count + '名'
            + ' / 平均月売上¥' + Math.round(g.sales/g.count).toLocaleString();
        }).join('\n');

      const heightGroups = {'-155':{count:0,sales:0},'156-160':{count:0,sales:0},'161-165':{count:0,sales:0},'166-170':{count:0,sales:0},'171+':{count:0,sales:0}};
      profiles.forEach(p => {
        if (!p.height) return;
        const h = p.height;
        const g = h<=155?'-155':h<=160?'156-160':h<=165?'161-165':h<=170?'166-170':'171+';
        heightGroups[g].count++; heightGroups[g].sales += p.avgMonthlySales;
      });
      const heightBlock = Object.keys(heightGroups)
        .filter(k => heightGroups[k].count > 0)
        .map(k => {
          const g = heightGroups[k];
          return '・' + k + 'cm：' + g.count + '名'
            + ' / 平均月売上¥' + Math.round(g.sales/g.count).toLocaleString();
        }).join('\n');

      const cupGroups = {};
      profiles.forEach(p => {
        const c = p.cup || '未設定';
        if (!cupGroups[c]) cupGroups[c] = {count:0,sales:0};
        cupGroups[c].count++; cupGroups[c].sales += p.avgMonthlySales;
      });
      const cupBlock = Object.keys(cupGroups).sort().map(c => {
        const g = cupGroups[c];
        return '・' + (c !== '未設定' ? c + 'カップ' : c) + '：' + g.count + '名'
          + ' / 平均月売上¥' + Math.round(g.sales/g.count).toLocaleString();
      }).join('\n');

      const regular = profiles.filter(p => !p.isDispatch);
      const dispatch = profiles.filter(p => p.isDispatch);

      const dataBlock = [
        '【キャスト在籍状況】',
        '在籍キャスト：' + regular.length + '名',
        '派遣キャスト：' + dispatch.length + '名',
        '集計期間：直近3ヶ月平均',
        '',
        '【系統別分布×実績】',
        typeBlock || 'データなし',
        '',
        '【年齢別分布×実績】',
        ageBlock || 'データなし',
        '',
        '【身長別分布×実績】',
        heightBlock || 'データなし',
        '',
        '【カップ別分布×実績】',
        cupBlock || 'データなし'
      ].join('\n');

      systemPrompt = [
        'あなたはキャバクラの採用戦略を専門とするAIです。',
        '提供された在籍キャストの特性データと実績を分析し、',
        '店舗が次にどんなキャストを採用すべきかを提案してください。',
        '現在の時期・業界動向・店舗特性も踏まえて採用戦略を提案してください。',
        '',
        sharedCtx,
        '',
        '【分析の視点】',
        '',
        '■ 系統の分析',
        '  castTypeは自由入力のため、似た系統（例：清楚系・清楚など）は同一グループとして解釈する',
        '  特定の系統に偏りすぎていないか確認する',
        '  実績（売上・指名）が高い系統を特定する',
        '',
        '■ 年齢バランス',
        '  若手・中堅・ベテランのバランスを評価する',
        '  特定年齢層に偏っている場合はリスクを指摘する',
        '  実績との相関を読む',
        '',
        '■ 身長・スタイル',
        '  現在の分布を確認し、偏りがあれば指摘する',
        '  実績との相関があれば言及する',
        '',
        '■ ギャップ分析',
        '  現在のラインナップで不足している属性・系統を特定する',
        '  客層のバランス（幅広い客を取り込めているか）を評価する',
        '',
        '【採用提案の原則】',
        '・既存の強みを維持しながら弱点を補う採用を優先する',
        '・1タイプへの集中は長期的リスク（その系統が流行り廃りする）',
        '・実績データに基づいた提案をする',
        '・断定せず「〜の傾向があります」「〜を検討してください」で提示する',
        '・データが少ない属性については「サンプル数が少ないため参考程度に」と明記する',
        '',
        '【回答フォーマット】',
        '1. 現在のキャスト構成の評価（強みと偏り）',
        '2. 実績が高い属性の傾向',
        '3. 不足している・補強すべき属性',
        '4. 今週〜来週で動ける採用アクション（面接を入れるべきターゲット像・スカウト媒体の方向性など）',
        '5. 中長期の採用方針',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        dataBlock
      ].join('\n');

    } else if (type === 'ai-shift') {

      const sd = shiftData || {};
      const dow = ['日','月','火','水','木','金','土'];

      const dowBlock = (sd.byDayOfWeek || []).map(d => {
        const diff = d.avgActual - d.quota;
        const diffStr = diff >= 0 ? '+' + diff.toFixed(1) : diff.toFixed(1);
        return [
          '・' + dow[d.day] + '曜（' + d.totalDays + '日分）',
          '  目標:' + d.quota + '人 / 実績平均:' + d.avgActual.toFixed(1) + '人 / 差:' + diffStr,
          '  過多:' + d.overDays + '日 / 不足:' + d.underDays + '日',
          '  平均売上:¥' + (d.avgSales||0).toLocaleString(),
          d.avgSalesWhenUnder ? '  不足時売上:¥' + d.avgSalesWhenUnder.toLocaleString() : '',
          d.avgSalesWhenOver  ? '  過多時売上:¥' + d.avgSalesWhenOver.toLocaleString()  : ''
        ].filter(Boolean).join('\n');
      }).join('\n\n');

      const castBlock = (sd.castProfiles || []).map(c => {
        const topDays = (c.topCustomerDays || []).map(di => dow[di] + '曜').join('・');
        const workDays = (c.actualWorkDays || []).map(di => dow[di] + '曜').join('・');
        return [
          '【' + c.name + (c.isDispatch ? '（派遣）' : '') + '】',
          '  契約シフト：' + (c.contractShift || '未設定'),
          '  今月実出勤日数：' + c.monthActualDays + '日',
          '  出勤曜日の傾向：' + (workDays || 'データなし'),
          '  月間売上：¥' + (c.totalSales||0).toLocaleString(),
          '  1出勤あたり売上：¥' + (c.avgSalesPerDay||0).toLocaleString(),
          '  月間指名組数：' + (c.totalNominations||0) + '組',
          '  顧客の来店が多い曜日：' + (topDays || 'データなし')
        ].join('\n');
      }).join('\n\n');

      const nextWeekBlock = (sd.nextWeekSchedule || []).map(w => {
        const gapStr = w.gap > 0 ? '（+' + w.gap + '名 過多）' : w.gap < 0 ? '（' + w.gap + '名 不足）' : '（目標通り）';
        const names = w.scheduled.length > 0 ? w.scheduled.join('・') : 'なし';
        return '・' + w.date + '（' + w.dowLabel + '）目標' + w.quota + '人 予定' + w.scheduled.length + '人' + gapStr + '\n  出勤予定：' + names;
      }).join('\n');

      const dataBlock = [
        '【今月の曜日別シフト傾向（実績）】',
        dowBlock,
        '',
        '【来週のシフト予定（今週中に調整が必要）】',
        nextWeekBlock || 'データなし',
        '',
        '【キャスト別実績・顧客来店パターン】',
        castBlock
      ].join('\n');

      systemPrompt = [
        'あなたはキャバクラのシフト最適化を専門とするAIです。',
        '今月の曜日別実績パターンとキャスト情報をもとに、来週のシフトを今週中に調整するための具体的な提案をしてください。',
        '現在の時期・直近イベント・業界動向も踏まえてシフト戦略を提案してください。',
        '',
        sharedCtx,
        '',
        '【業界知識・前提】',
        '・シフト不足の日は機会損失（席が回らない）、過多の日は人件費の無駄',
        '・週末（特に金曜・土曜）は基本的に多めで攻める',
        '・キャストの顧客が来やすい曜日にそのキャストが出勤していないと、客が離れるリスクがある',
        '・1出勤あたり売上が高いキャストは出勤を増やすほど店の利益が上がる',
        '・指名が多いキャストが休みの日に太客が来ても売上に繋がりにくい',
        '',
        '【分析の視点】',
        '',
        '■ 来週の不足・過多日を特定する',
        '  「来週シフト予定」を見て、目標人数との乖離が大きい日を優先的に調整対象とする',
        '  不足日には誰を追加できるか、過多日には誰を外せるかを検討する',
        '',
        '■ キャスト個別の最適化',
        '  1. 1出勤あたり売上が高いキャストが不足日に入っていない → 最優先で追加交渉',
        '  2. 顧客の来店が多い曜日にそのキャストが休み → 顧客離れのリスクとして指摘',
        '  3. 指名が多いキャストが不足日に休んでいる → 優先的に調整',
        '  4. 契約シフトと実出勤が大きく乖離しているキャスト → 声がけのタイミング',
        '',
        '■ 具体的なアクション形式で提案する',
        '  「○○さんに金曜の出勤を打診する」',
        '  「○○さんの水曜を金曜にずらすよう相談する」',
        '  のように、今週中にマネージャーが動ける形で名前と曜日を明示する',
        '',
        '【判断の原則】',
        '・来週の予定シフトを起点に、今週中に動けるアクションに絞る',
        '・データが少ない場合は「サンプル不足」と明記する',
        '・断定を避け「〜を検討してください」「〜を打診してみてください」で提示する',
        '・派遣キャストへの出勤増加提案はコスト面の注意を添える',
        '',
        '【回答フォーマット】',
        '1. 来週のシフト概況（不足・過多の日を一覧で、2〜3行）',
        '2. 優先調整が必要な日と理由',
        '3. キャスト別アクション（今週中に打診・声がけすべき内容を名前と曜日付きで）',
        '4. 来週以降の改善ポイント（シフト定数・曜日構成の見直し提案）',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        dataBlock
      ].join('\n');

    } else if (type === 'ai-attendance') {

      const ad = attendanceData || {};

      const castBlock = (ad.castProfiles || []).map(c => {
        const lines = [
          '【' + c.name + '】',
          '  契約シフト：' + (c.contractShift || '未設定'),
          '  月間想定日数：' + (c.expectedDays != null ? c.expectedDays + '日' : '算出不可'),
          '  月間実出勤日数：' + c.monthActualDays + '日',
          '  保留（未確定）日数：' + c.pendingDays + '日',
          '  当欠：' + c.absenceCount + '回',
          '  遅刻：' + c.tardyCount + '回',
          '  月間売上：¥' + (c.totalSales||0).toLocaleString(),
          '  1出勤あたり売上：¥' + (c.avgSalesPerDay||0).toLocaleString()
        ];
        if (c.expectedDays != null && c.expectedDays > 0) {
          lines.push('  出勤達成率：' + Math.round(c.monthActualDays / c.expectedDays * 100) + '%');
        }
        return lines.join('\n');
      }).join('\n\n');

      const dataBlock = [
        '【勤怠データ：' + (ad.yearMonth||'') + '】',
        '対象キャスト数：' + (ad.castProfiles||[]).length + '名（問題あり）',
        '',
        castBlock || '　問題のあるキャストはいません'
      ].join('\n');

      systemPrompt = [
        'あなたはキャバクラのキャスト勤怠管理を専門とするAIです。',
        '提供された勤怠データをもとに、どのキャストにどんな改善が必要かを具体的に提案してください。',
        '※データは問題があるキャストのみ（当欠・遅刻・保留多数・達成率85%未満）を抽出しています。',
        '現在の時期・業界動向も踏まえて勤怠管理の優先度を判断してください。',
        '',
        sharedCtx,
        '',
        '【業界知識・前提】',
        '・当欠（当日欠勤）は店舗運営に直接ダメージを与える。特に売上が高いキャストの当欠は損失が大きい',
        '・遅刻は客への対応が遅れ、席の回転やキャストの印象に影響する',
        '・保留（pending）が多いキャストはシフト管理が不安定で計画が立てにくい',
        '・契約シフトと実出勤の乖離が大きいキャストは離職リスクが高い可能性がある',
        '・売上が高いキャストの当欠は低いキャストの当欠より店へのダメージが大きい',
        '・当欠が繰り返される場合は振替出勤・ペナルティルール適用を検討する',
        '・遅刻が多い場合は出勤予定時刻の設定を見直す可能性もある',
        '',
        '【分析の視点】',
        '',
        '■ 問題の深刻度の判定',
        '  当欠2回以上 → 要対応',
        '  遅刻3回以上 → 要対応',
        '  出勤達成率70%未満 → 要対応',
        '  保留が多い（月3日以上）→ シフト管理が不安定',
        '',
        '■ 売上との掛け合わせ',
        '  売上が高いキャストの問題は優先度を上げる',
        '  当欠×高売上 → 緊急対応',
        '  当欠×低売上 → 勤怠改善と同時に売上改善も必要',
        '',
        '■ 改善提案の方向性',
        '  当欠が多い → 面談・振替出勤・ペナルティルール適用を検討',
        '  遅刻が多い → 出勤予定時刻の見直し・原因のヒアリング',
        '  保留が多い → シフト確定を早める・連絡ルールの徹底',
        '  達成率が低い → 契約シフトの見直し or 出勤を増やすアプローチ',
        '',
        '【判断の原則】',
        '・名前を出して具体的に言及する',
        '・深刻度を「緊急・要対応・経過観察」で分類する',
        '・断定を避け「〜を検討してください」で提示する',
        '・データが少ない場合は「サンプル不足」と明記する',
        '',
        '【回答フォーマット】',
        '1. 全体の勤怠評価（2〜3行）',
        '2. 緊急対応が必要なキャスト（名前・問題・推奨アクション）',
        '3. 要対応キャスト（名前・問題・推奨アクション）',
        '4. 経過観察キャスト（名前・気になる点）',
        '5. 店舗全体の勤怠ルール改善案',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        dataBlock
      ].join('\n');

    } else if (type === 'store-attendance') {

      const ad = storeData || {};
      const castBlock3 = (ad.casts || []).map(c => {
        const rate = c.contractShift > 0 ? Math.round(c.workDays / c.contractShift * 100) : null;
        return '・' + c.name + '：契約' + (c.contractShift||'-') + '日 / 実績' + c.workDays + '日'
          + (rate !== null ? '（達成率' + rate + '%）' : '')
          + (c.isDispatch ? '（派遣）' : '');
      }).join('\n');

      systemPrompt = [
        'あなたはキャバクラ店舗の勤怠管理を専門とするAIです。',
        '週次レビューとして、今週の勤怠状況を振り返り、来週に向けて今週中に動けるアクションを提案してください。',
        '',
        '【分析の視点】',
        '・契約シフトに対して出勤日数が少ないキャストは要フォロー',
        '・達成率が低い原因（体調・モチベ・プライベート）を想定しアドバイスに反映する',
        '・逆に達成率が高いキャストへの感謝・維持施策も重要',
        '・出勤不安定なキャストは売上も不安定になりやすい',
        '・今週時点での月間達成ペースを確認し、このまま続くと月末にどうなるかを見通す',
        '',
        '【判断の原則】',
        '・断定しない。「〜の可能性があります」「〜を検討してください」で提示する',
        '・勤怠の問題は個別に丁寧に対応する必要がある点を考慮する',
        '・今週中に声がけできる内容に絞って提案する',
        '',
        '【回答フォーマット】',
        '1. 全体の勤怠評価（今週時点での月間ペースを含め2〜3行）',
        '2. 要フォローキャスト（名前と理由）',
        '3. 各キャストへの声がけ・対応提案',
        '4. 来週に向けた声がけ・対応アクション（今週中に動ける内容）',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        '【キャスト別勤怠データ】',
        '対象期間：' + (ad.yearMonth || ''),
        castBlock3
      ].join('\n');

    } else if (type === 'ai-visits') {

      const vd = visitsData || {};
      const dow = ['日','月','火','水','木','金','土'];

      const upcomingBlock = (vd.upcomingSoon || []).map(c => {
        const timing = c.daysUntilNext <= 0
          ? Math.abs(c.daysUntilNext) + '日超過（今すぐ連絡）'
          : c.daysUntilNext + '日後';
        return '・' + c.customerName + '（担当：' + c.castName + '）'
          + ' 予測：' + c.predictedNextDate + '（' + timing + '）'
          + ' 平均間隔：' + c.avgInterval + '日'
          + ' リスク：' + c.riskLevel;
      }).join('\n') || 'なし';

      const dowBlock = (vd.dowAnalysis || [])
        .filter(d => d.sampleDays > 0)
        .map(d => '・' + dow[d.day] + '曜：平均' + d.avgGuests + '人/日（' + d.sampleDays + '日分）')
        .join('\n') || 'なし';

      const cp = vd.castPickups || {};
      const bdBlock = (cp.birthdayPickups || []).map(c => {
        const urgency = c.daysUntilBd <= 7 ? '【今すぐ動く】' : c.daysUntilBd <= 14 ? '【今週中】' : '【来週中】';
        return urgency + ' ' + c.castName
          + ' 誕生日：' + c.birthdayDate + '（' + c.daysUntilBd + '日後）'
          + ' 顧客数：' + c.custCount + '名 / 今月指名：' + c.totalNoms + '組';
      }).join('\n') || 'なし';

      const nomBlock = (cp.topNomCasts || []).map((c, i) =>
        (i+1) + '位 ' + c.castName
          + '：今月' + c.thisMonthNoms + '組 / 先月' + c.lastMonthNoms + '組'
          + '（2ヶ月平均 ' + c.avgNoms + '組）'
      ).join('\n') || 'なし';

      const evBlock = (vd.upcomingEvents || []).map(ev => {
        const urgency = ev.daysUntil <= 7 ? '【今すぐ動く】' : ev.daysUntil <= 14 ? '【今週中に準備】' : '【来週中に準備】';
        return urgency + ' ' + ev.name
          + '：' + ev.date + '（' + ev.daysUntil + '日後）'
          + (ev.isAnniversary ? ' ★周年イベント' : '');
      }).join('\n') || 'なし';

      const dataBlock = [
        '【来店予測・来店予定ピックアップデータ】',
        '',
        '■ 近日来店が予測される顧客（次の14日以内・過去3日超過含む）',
        upcomingBlock,
        '',
        '■ 曜日別 平均来店客数（直近2ヶ月）',
        dowBlock,
        '',
        '■ バースデーキャスト（来店予定を今から取らせるべき）',
        bdBlock,
        '',
        '■ 指名上位キャスト（人気を活かして来店予定を取らせるべき）',
        nomBlock,
        '',
        '■ 直近30日以内のイベント・記念日',
        evBlock
      ].join('\n');

      systemPrompt = [
        'あなたはキャバクラの来店予測と来店予定獲得を専門とするAIです。',
        '以下の4軸のデータを組み合わせて分析し、マネージャーが今週から動ける具体的なアクションを提案してください。',
        '現在の時期・直近イベント・業界動向も最大限活用してください。',
        '',
        sharedCtx,
        '',
        '【4つの分析軸】',
        '① 来店サイクル予測：顧客の平均来店間隔から近日来そうな顧客を特定し担当キャストに連絡させる',
        '② バースデーキャスト：誕生日が近いキャストに今から来店予定を取らせてイベント売上を最大化する',
        '③ 指名上位キャスト：人気キャストの指名力を活かして来週・再来週の来店予定を積ませる',
        '④ 直近イベント・記念日：バレンタイン・ハロウィン・クリスマス・店舗周年などに向けた来店予定の獲得',
        '',
        '【業界知識・前提】',
        '・来店予定を事前に取ることで売上の予測と安定化ができる',
        '・バースデーイベントは単価が上がりやすい（シャンパン・プレゼント・特別演出）',
        '・バレンタイン・クリスマス・ハロウィンなど季節イベントは客が来やすいタイミング',
        '・店舗周年は特別な演出ができる大きな集客チャンス',
        '・イベントは2〜3週間前から告知・予約を始めると効果が高い',
        '・指名が多いキャストほど来店予定が取りやすい',
        '・来店サイクルを超えた顧客は担当キャストが連絡しないと離脱リスクが上がる',
        '',
        '【分析の視点】',
        '',
        '■ 直近イベントの活用',
        '  イベント7日前以内 → 今すぐ全キャストが顧客に告知・予定取り',
        '  イベント14日前以内 → 今週中に準備・連絡開始',
        '  イベント30日前以内 → 来週中に準備',
        '  周年イベント → 全キャストへの動員指示が最優先',
        '  バレンタイン・クリスマス → カップル客・プレゼント需要を意識した声かけ',
        '  ハロウィン → 仮装・テーマイベントとして盛り上げる演出を提案',
        '',
        '■ 来店サイクル予測の解釈',
        '  daysUntilNext が0以下 → 今すぐ担当キャストに連絡させる',
        '  daysUntilNext が1〜7 → 今週中にアプローチ',
        '  daysUntilNext が8〜14 → 来週に向けて連絡開始',
        '  高リスク・要注意の顧客は優先度を上げる',
        '',
        '■ バースデーキャストの活用',
        '  誕生日が近いほど来店予定の獲得が売上に直結する',
        '  顧客数・指名数が多いキャストほど予定を多く取れる可能性が高い',
        '',
        '■ 指名上位キャストの活用',
        '  指名が多い = 来てくれる客がいる = 来店予定が取りやすい',
        '  イベント前後の日程で積極的に予定を取らせる',
        '',
        '【判断の原則】',
        '・名前を出して具体的に言及する（キャスト名・顧客名・イベント名）',
        '・アクションの優先順位を「今すぐ・今週中・来週中」で明示する',
        '・予測はあくまで傾向値。「〜が予測されます」「〜を検討してください」で提示する',
        '・イベントと顧客予測を組み合わせた提案を心がける',
        '',
        '【回答フォーマット】',
        '1. 今週〜来週のサマリー（来店予測・直近イベントを含む2〜3行）',
        '2. 直近イベント・記念日への対応（イベント名・推奨アクション・担当キャストへの指示）',
        '3. 今すぐ連絡すべき顧客リスト（担当キャスト名・顧客名・理由）',
        '4. 来店予定を取らせるべきキャストのピックアップ',
        '   ・バースデーキャスト（誰に・いつまでに・何人分）',
        '   ・指名上位キャスト（誰に・どの日程で）',
        '5. 曜日別の来店予測と来店予定を入れるべき日',
        '6. 今週のアクションプラン（優先順位順）',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        dataBlock
      ].join('\n');

    } else {
      // type === 'cast'（週次キャスト個別分析）
      const wd = req.body.weeklyData || null;

      const castBlock = [
        '【分析対象キャストのデータ（今月累計）】',
        'キャスト名：' + castData.name + (castData.isDispatch ? '（派遣）' : ''),
        '対象月：' + castData.period,
        '月間目標：¥' + (castData.targetSales || 0).toLocaleString(),
        '今月売上：¥' + (castData.salesTotal || 0).toLocaleString(),
        '達成率：' + (castData.targetSales ? Math.round((castData.salesTotal / castData.targetSales) * 100) : '-') + '%',
        '今月出勤日数：' + castData.workDays + '日',
        '本指名組数：' + castData.nominationCount + '組',
        '場内指名組数：' + castData.floorNominationCount + '組',
        '同伴数：' + castData.companionCount + '回',
        '1出勤あたり売上：¥' + (castData.workDays > 0 ? Math.round(castData.salesTotal / castData.workDays).toLocaleString() : 0),
        castData.lastMonthSales != null ? '前月売上：¥' + castData.lastMonthSales.toLocaleString() : null,
        castData.lastMonthSales ? '前月比：' + Math.round((castData.salesTotal / castData.lastMonthSales) * 100) + '%' : null
      ].filter(Boolean).join('\n');

      const weeklyBlock = wd && (wd.weeks || []).length > 0
        ? ['【週次トレンド（直近4週）】',
            ...wd.weeks.map(w =>
              '・' + w.label + '：売上¥' + (w.sales||0).toLocaleString()
              + ' 出勤' + w.workDays + '日'
              + ' 指名' + w.nominations + '組'
              + ' 同伴' + w.companions + '回'
            )
          ].join('\n')
        : null;

      const STATUS_LABEL = { work:'出勤', douhan:'同伴', pending:'保留' };
      const shiftBlock = castData.contractShift
        ? [
            '【シフト状況】',
            '契約シフト：' + castData.contractShift,
            castData.expectedDays != null ? '今月想定出勤日数：' + castData.expectedDays + '日' : null,
            '今月実出勤日数：' + (castData.thisMonthWorkDays || 0) + '日'
              + (castData.thisMonthPending > 0 ? '（保留' + castData.thisMonthPending + '日含む）' : ''),
            castData.expectedDays != null && castData.expectedDays > 0
              ? '出勤達成率：' + Math.round((castData.thisMonthWorkDays || 0) / castData.expectedDays * 100) + '%'
              : null,
            castData.upcomingShifts && castData.upcomingShifts.length > 0
              ? '今後14日のシフト：' + castData.upcomingShifts.map(s => s.date.slice(5) + '（' + (STATUS_LABEL[s.status] || s.status) + '）').join('  ')
              : '今後14日のシフト：未登録'
          ].filter(Boolean).join('\n')
        : null;

      const visitBlock = castData.upcomingVisits && castData.upcomingVisits.length > 0
        ? ['【来店予定（今後14日）：' + castData.upcomingVisits.length + '件】',
            ...castData.upcomingVisits.map(v =>
              '・' + v.date.slice(5)
              + (v.guestName ? ' ' + v.guestName : '')
              + (v.count ? ' ' + v.count + '名' : '')
              + (v.note ? '（' + v.note + '）' : '')
            )
          ].join('\n')
        : '【来店予定（今後14日）：0件】\n　来店予定なし';

      const today = new Date();
      const analyzed = (customerData || []).map(c => {
        const last = new Date(c.lastVisitDate);
        const days = Math.floor((today - last) / 86400000);
        const avg = c.averageVisitInterval || 30;
        const risk = days >= avg * 2 ? '高リスク' : days >= avg * 1.5 ? '要注意' : '良好';
        return { ...c, daysSinceLast: days, risk };
      });
      const highRisk = analyzed.filter(c => c.risk === '高リスク');
      const caution  = analyzed.filter(c => c.risk === '要注意');
      const customerBlock = customerData && customerData.length > 0
        ? [
            '【担当顧客データ】',
            '総顧客数：' + analyzed.length + '名（良好 ' + analyzed.filter(c => c.risk === '良好').length + '名 / 要注意 ' + caution.length + '名 / 高リスク ' + highRisk.length + '名）',
            '',
            '高リスク顧客（離脱の可能性）：',
            highRisk.length > 0
              ? highRisk.map(c => '・' + c.name + '（' + c.nominationType + '）最終来店：' + c.daysSinceLast + '日前 / 平均来店間隔：' + c.averageVisitInterval + '日').join('\n')
              : '　なし',
            '',
            '要注意顧客：',
            caution.length > 0
              ? caution.map(c => '・' + c.name + '（' + c.nominationType + '）最終来店：' + c.daysSinceLast + '日前 / 平均来店間隔：' + c.averageVisitInterval + '日').join('\n')
              : '　なし'
          ].join('\n')
        : '【担当顧客データ】データなし';

      systemPrompt = [
        'あなたはキャバクラの黒服マネージャーを支援するAIです。',
        '週次レビューとして、今週の振り返りと来週に向けた具体的なアクションを提案してください。',
        'シフト・来店予定・顧客データを組み合わせてマネージャーが今週中に動ける内容を中心に答えてください。',
        '',
        '【分析の視点】',
        '',
        '■ 今週の売上トレンド',
        '- 直近4週の推移から今週のパフォーマンスを評価する',
        '- 週ごとの出勤日数・指名・同伴の変化も見る',
        '- 今月累計の達成率を月の経過日数と合わせて評価する',
        '',
        '■ シフト管理',
        '- 契約シフトに対して今月の実出勤が足りているか',
        '- 出勤達成率が低い場合は出勤増の打診が必要',
        '- 今後14日のシフトが少ない場合は今週中に調整を促す',
        '- 保留（未確定）が多い場合はシフト確定を急ぐよう促す',
        '',
        '■ 来週の来店予定の立ち具合',
        '- 来店予定が0件なら今週中に顧客への連絡を指示する',
        '- 来店予定が少ない場合は具体的にどの顧客に連絡すべきかを顧客データから提案する',
        '- 来週のシフト出勤日と来店予定日が一致しているか確認する',
        '',
        '■ 指名力・接客評価',
        '- 本指名：既存顧客関係の強さ',
        '- 場内指名：フロアでの接客力',
        '- 本指名が少なく場内が多い → リピートに繋げられていない可能性',
        '',
        '■ 同伴',
        '- 同伴は関係値の深さを示す。売上があっても同伴ゼロは関係が浅い可能性',
        '',
        '■ 顧客ポートフォリオ',
        '- 高リスク（平均来店間隔の2倍超）→ 今すぐ担当キャストに連絡させる',
        '- 要注意（1.5倍超）→ 今週中にアプローチ',
        '',
        '■ 派遣キャストの場合',
        'isDispatch が true なら長期指名より当日接客貢献で評価。同伴・アフターのアドバイスは控えめにする。',
        '',
        '【判断の原則】',
        '- 来週中に動ける具体的なアクションに絞る',
        '- 数字が出ていないキャストにも改善の余地を必ず見つける',
        '- 断定しない。「〜を検討してください」「〜を打診してみてください」で提示する',
        '- データが少ない場合は「データ不足のため参考程度に」と明記する',
        '',
        '【回答フォーマット】',
        '1. 今週の総合評価（月次目標進捗・週トレンドを含め2〜3行）',
        '2. シフト状況と来週に向けた調整アクション',
        '3. 来店予定の状況と今週中に連絡すべき顧客（名前・理由・優先度）',
        '4. 売上・指名・同伴の課題と改善アドバイス',
        '5. 来週のアクションプラン（優先順位順）',
        '',
        'iPadで読みやすい長さにする。長くなりすぎない。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        castBlock,
        weeklyBlock || '',
        shiftBlock || '',
        visitBlock,
        '',
        customerBlock
      ].filter(s => s !== null).join('\n');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 3000,
        system: systemPrompt,
        messages: messages
      })
    });

    const data = await response.json();
    res.status(200).json(data);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
