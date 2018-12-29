const log = require('debug')('servicebus-retry:acks')

const hasBeenAcked = (context, get) =>
  async uniqueId => {
    const uniqueIdForAck = `ack-${uniqueId}`
    log(`checking if ${uniqueIdForAck} has been acked`)
    let value = await get.call(context, uniqueIdForAck)
    return !!value 
  }

module.exports.hasBeenAcked = hasBeenAcked

const ack = (context, increment) => 
  async (uniqueId, cb) => {
    const uniqueIdForAck = `ack-${uniqueId}`
    log(`acking ${uniqueIdForAck}`)
    return await increment.call(context, [uniqueIdForAck, cb])
  }

module.exports.ack = ack