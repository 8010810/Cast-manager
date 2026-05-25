export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, castData, customerData } = req.body;

    const castBlock = [
      '【分析対象キャストのデータ】',
      'キャスト名：' + castData.name + (castData.isDispatch ? '（派遣）' : ''),
      '対象期間：' + castData.period,
      '月間目標：¥' + (castData.targetSales || 0).toLocaleString(),
      '現在の売上：¥' + (castData.salesTotal || 0).toLocaleString(),
      '達成率：' + (castData.targetSales ? Math.round((castData.salesTotal / castData.targetSales) * 100) : '-') + '%',
      '出勤日数：' + castData.workDays + '日',
      '本指名組数：' + castData.nominationCount + '組',
      '場内指名組数：' + castData.floorNominationCount + '組',
      '同伴数：' + castData.companionCount + '回',
      '1出勤あたり売上：¥' + (castData.workDays > 0 ? Math.round(castData.salesTotal / castData.workDays).toLocaleString() : 0),
      castData.lastMonthSales != null ? '前月売上：¥' + castData.lastMonthSales.toLocaleString() : null,
      castData.lastMonthSales ? '前月比：' + Math.round((castData.salesTotal / castData.lastMonthSales) * 100) + '%' : null
    ].filter(Boolean).join('\n');

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

    const SYSTEM_PROMPT = [
      'あなたはキャバクラの黒服マネージャーを支援するAIです。',
      '提供されたキャスト個人のデータと担当顧客データを分析し、マネージャーが具体的に動けるアドバイスをしてください。',
      '',
      '【分析の視点】',
      '',
      '■ 売上・目標達成率',
      '- 目標に対して現在どのポジションにいるか',
      '- 月の経過日数を考慮した進捗評価（月初と月末では意味が違う）',
      '- 前月比がある場合はトレンドも評価する',
      '',
      '■ 出勤安定性',
      '- 出勤日数の多寡と1出勤あたり売上で効率を判断',
      '- 売上不振の原因が出勤にあるのか接客にあるのかを切り分ける',
      '',
      '■ 指名力',
      '- 本指名数：既存顧客関係の強さ',
      '- 場内指名数：フロアでの接客力',
      '- 本指名が少なく場内が多い → リピートに繋げられていない可能性',
      '- 両方少ない → 接客の改善が必要',
      '',
      '■ 同伴',
      '- 同伴数は顧客との関係値の深さを示す',
      '- 売上はあるが同伴ゼロ → 関係値が浅い客が多い可能性',
      '',
      '■ 顧客ポートフォリオ分析',
      '来店リスクの判定基準：',
      '- 平均来店間隔の2倍以上 → 高リスク',
      '- 平均来店間隔の1.5倍以上 → 要注意',
      '- 直近1ヶ月以内 → 良好',
      '',
      '■ 派遣キャストの場合',
      'isDispatch が true の場合、長期的な本指名の積み上げより当日の接客貢献度で評価する。',
      '同伴・アフターのアドバイスは控えめにする。',
      '',
      '【判断の原則】',
      '- マネージャーは見切りをつけない。数字が出ていないキャストにも改善の余地を必ず見つける',
      '- 売上だけで評価しない。出勤・場内指名・同伴・顧客ポートフォリオを複合的に見る',
      '- 数字が良いキャストへの「当たり前扱い」をしない',
      '- 短期（今月）と中期（来月以降）を分けてアドバイスする',
      '- 断定しない。「〜という可能性があります」「〜を検討してください」で提示する',
      '- データが少ない場合は「データ不足のため判断は慎重に」と明記する',
      '',
      '【回答フォーマット】',
      '以下の構成で日本語で答える：',
      '',
      '1. 総合評価（2〜3行）',
      '2. 良い点',
      '3. 課題',
      '4. 要フォロー顧客リスト（高リスク・要注意を名前付きで、優先順位と一言コメント）',
      '5. 今月の具体的なアクション（マネージャーがキャストに指示できる内容）',
      '6. 来月に向けた準備',
      '',
      'iPadで読みやすい長さにする。長くなりすぎない。',
      '最後に「最終判断はマネージャーが行ってください」を添える。',
      '',
      castBlock,
      '',
      customerBlock
    ].join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    const data = await response.json();
    res.status(200).json(data);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
