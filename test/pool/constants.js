const { utils } = require('ethers');

const ActivityType = {
  Lock: 0,
  Withdraw: 1,
};

const PoolType = {
  Liquid: 0,
  ProlongedLiquid: 1,
  Permanent: 2,
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
  TWO_YEARS: 63_158_400, //2 years considering leap years in seconds,
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
