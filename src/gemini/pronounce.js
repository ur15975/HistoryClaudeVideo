// 历史专名的读音纠正：仅替换送进 TTS 的文本，字幕仍显示原字。
// 做法是换成读音相同的常用字，比拼音标注更稳定。
export const DEFAULT_PRONUNCIATIONS = {
  单于: '蝉于', // chán yú
  阏氏: '烟支', // yān zhī
  冒顿: '莫独', // mò dú
  月氏: '月支', // yuè zhī
  大宛: '大渊', // dà yuān
  龟兹: '秋词', // qiū cí
  吐谷浑: '吐玉浑', // tǔ yù hún
  可汗: '克寒', // kè hán
  堂邑父: '堂邑甫', // fǔ，古代男子美称
  甘父: '甘甫',
  身毒: '捐毒', // yuān dú（古印度）
  鄯善: '善善',
  番禺: '潘禺',
  会稽: '快稽',
};

export function applyPronunciations(text, extra = {}) {
  const dict = { ...DEFAULT_PRONUNCIATIONS, ...extra };
  // 长词优先，避免“堂邑父”被“甘父”之类的短词抢先替换
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  let out = text;
  for (const k of keys) out = out.split(k).join(dict[k]);
  return out;
}
