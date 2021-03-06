import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import { StatusCodes } from 'http-status-codes';
import 'mocha';
import MockDate from 'mockdate';
import sinon from 'sinon';

chai.use(chaiHttp);

import swapperAPI from '../../src/routes/Swapper';
import OkexService from '../../src/services/Okex.service';

describe('Swapper API', async function() {
  const NOW = new Date();
  const THIRTY_SECONDS = 30 * 1000;

  beforeEach(() => {
    MockDate.set(NOW);
  });

  afterEach(() => {
    MockDate.reset();
    sinon.restore();
  });


  describe('/status', async function() {
    it('Should return status response on call', async function() {
      const request = chai.request(swapperAPI).get('/status');
      const response = await request;

      expect(response.status).to.equal(StatusCodes.OK);
      expect(response.text).to.equal('Swapper is alive');
    });
  });

  describe('/createSwapOrder', async function() {
    it('Should return a the data for the trade order', async function() {
      sinon.stub(OkexService.prototype, 'getMarketBooks').callsFake(async () => {
        return {
          asks: [['36713.5', '15169', '0', '1']],
          bids: [['36687', '17171', '0', '1']],
          timestamp: NOW,
        };
      });

      const request = chai.request(swapperAPI).post('/createSwapOrder').send({
        pair: 'BTC-USDT',
        side: 'buy',
        volume: '1000',
      });
      const response = await request;

      expect(response.status).to.equal(StatusCodes.OK);
      expect(response.body).to.have.own.property('id');
      expect(response.body).to.not.have.own.property('providerPrice');
      expect(response.body).to.deep.include({
        pair: 'BTC-USDT',
        side: 'buy',
        volume: '1000',
        price: '37447.77',
        start: NOW.toISOString(),
        expiration: new Date(NOW.getTime() + THIRTY_SECONDS).toISOString(),
      });
    });

    it('Should return an error when there are not enough orders to fulfill the request', async function() {
      sinon.stub(OkexService.prototype, 'getMarketBooks').callsFake(async () => {
        return {
          asks: [['36713.5', '15', '0', '1']],
          bids: [['36687', '17', '0', '1']],
          timestamp: NOW,
        };
      });

      const request = chai.request(swapperAPI).post('/createSwapOrder').send({
        pair: 'BTC-USDT',
        side: 'buy',
        volume: '1000',
      });
      const response = await request;

      expect(response.status).to.equal(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).to.deep.include({
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: 'Not enough orders to fulfill the swap',
      });
    });
  });

  describe('/confirmSwapOrder', async function() {
    it('Should fail when no orderId is specified', async function() {
      const request = chai.request(swapperAPI).post('/confirmSwapOrder').send({});
      const response = await request;

      expect(response.status).to.equal(StatusCodes.BAD_REQUEST);
      expect(response.body).to.have.own.property('errors');

      const errors = response.body.errors;
      expect(errors).to.be.an('array');

      const swapIdError = errors[0];
      expect(swapIdError).to.deep.equal({
        msg: 'Invalid value',
        param: 'swapId',
        location: 'body',
      });
    });


    it('Should fail when swap is not found', async function() {
      const swapId = 654231;

      const request = chai.request(swapperAPI).post('/confirmSwapOrder').send({ swapId });
      const response = await request;

      expect(response.status).to.equal(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body).to.deep.include({
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: `No swap found with id ${swapId}`,
      });
    });

    it('Should confirm a swap created previously', async function() {
      sinon.stub(OkexService.prototype, 'getMarketBooks').callsFake(async () => {
        return {
          asks: [['36713.5', '15169', '0', '1']],
          bids: [['36687', '17171', '0', '1']],
          timestamp: NOW,
        };
      });
      sinon.stub(OkexService.prototype, 'placeOrder').callsFake(async () => {
        return '312269865356374016';
      });

      const createSwapRequest = chai.request(swapperAPI).post('/createSwapOrder').send({
        pair: 'BTC-USDT',
        side: 'sell',
        volume: '1000',
      });
      const createSwapResponse = await createSwapRequest;

      const swapId: number = createSwapResponse.body.id;
      const confirmSwapRequest = chai.request(swapperAPI).post('/confirmSwapOrder').send({
        swapId,
      });
      const confirmSwapResponse = await confirmSwapRequest;

      expect(confirmSwapResponse.status).to.equal(StatusCodes.OK);
      expect(confirmSwapResponse.body).to.deep.equal({
        id: swapId,
        pair: 'BTC-USDT',
        side: 'sell',
        volume: '1000',
        price: '35953.26',
        execution: NOW.toISOString(),
      });
    });

    it('Should fail when cannot confirm swap in provider', async function() {
      sinon.stub(OkexService.prototype, 'getMarketBooks').callsFake(async () => {
        return {
          asks: [['36713.5', '15169', '0', '1']],
          bids: [['36687', '17171', '0', '1']],
          timestamp: NOW,
        };
      });
      sinon.stub(OkexService.prototype, 'placeOrder').callsFake(async () => {
        throw new Error('Order placement failed due to insufficient balance');
      });

      const createSwapRequest = chai.request(swapperAPI).post('/createSwapOrder').send({
        pair: 'BTC-USDT',
        side: 'sell',
        volume: '1000',
      });
      const createSwapResponse = await createSwapRequest;

      const swapId: number = createSwapResponse.body.id;
      const confirmSwapRequest = chai.request(swapperAPI).post('/confirmSwapOrder').send({
        swapId,
      });
      const confirmSwapResponse = await confirmSwapRequest;

      expect(confirmSwapResponse.status).to.equal(StatusCodes.INTERNAL_SERVER_ERROR);
      expect(confirmSwapResponse.body).to.deep.include({
        status: StatusCodes.INTERNAL_SERVER_ERROR,
        message: 'Order placement failed due to insufficient balance',
      });
    });
  });
});
