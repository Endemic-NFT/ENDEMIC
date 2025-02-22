const { utils } = require('ethers');

const ActivityType = {
  Lock: 0,
  Withdraw: 1,
};

const PoolType = {
  Liquid: 0,
  ShortProlongedLiquid: 1,
  LongProlongedLiquid: 2,
};

const Events = {
  TokenActivity: 'TokenActivity',
  UnlockPeriodStarted: 'UnlockPeriodStarted',
};

const Errors = {
  UnlockPeriodExists: 'UnlockPeriodExists',
  InsufficientAmount: 'InsufficientAmount',
  UnlockPeriodNotFinished: 'UnlockPeriodNotFinished',
  UnlockPeriodFinished: 'UnlockPeriodFinished',
  LockPeriodNotFinished: 'LockPeriodNotFinished',
};

const TimePeriods = {
  FOUR_WEEKS: 4 * 7 * 24 * 60 * 60,
  SIX_MONTHS: 15_778_463, // 6 months in seconds
  ONE_YEAR: 31_556_926, // 1 year in seconds
};

function generateCurrencies() {
  const numberWords = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
  const currencyObject = {};

  numberWords.forEach((word, index) => {
    const key = `${word}_ETHER`;
    const value = index + 1;
    currencyObject[key] = utils.parseEther(value.toString());
  });

  return currencyObject;
}

module.exports = {
  Events,
  Errors,
  TimePeriods,
  ActivityType,
  PoolType,
  Currencies: generateCurrencies(),
};
