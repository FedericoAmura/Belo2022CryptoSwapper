import { Request, Response } from 'express';
import { body } from 'express-validator';
import { StatusCodes } from 'http-status-codes';

import Base from './Base';
import Swap from '../model/Swap';
import SwapRepository from '../repositories/Swap.repository';

const swapRepository = new SwapRepository();

class Swapper extends Base {
  protected routes(): void {
    this.express.use('/status', this.getSwapperStatus);
    this.express.post('/createSwapOrder',
      body('pair').exists({ checkFalsy: true }).isLength({ min: 7, max: 9}),
      body('side').exists({ checkFalsy: true }).isIn(['buy', 'sell']),
      body('volume').exists({ checkFalsy: true }).isDecimal(),
      this.rejectErrors,
      this.createSwapOrder
    );
  }

  // Routes
  private getSwapperStatus(req: Request, res: Response): void {
    res.status(StatusCodes.OK).send('Swapper is alive');
  }

  private async createSwapOrder(req: Request, res: Response): Promise<void> {
    const { pair, side, volume } = req.body;

    const swap = new Swap(pair, side, volume);
    await swap.updatePriceOffer();
    await swapRepository.saveSwap(swap);

    res.status(StatusCodes.OK).json({
      id: swap.id,
      pair: swap.pair,
      side: swap.side,
      volume: swap.volume,
      price: swap.price,
      start: swap.start,
      expiration: swap.expiration,
    });
  }
}

export default new Swapper().express;
