/*
  A modbus device we're connecting to
 */
const _             = require('lodash');
const ModbusRTU     = require("modbus-serial");
const ModbusElement = require('./modbusElement');
const EventEmitter  = require('events').EventEmitter;
const util          = require('util');
const async         = require('async');

/**
 * Constructor
 * @param device
 * @constructor
 */
function ModbusDevice(device) {
  EventEmitter.call(this);
  this.url      = _.get(device, 'server.url', 'localhost');
  this.port     = _.get(device, 'server.port', 552);
  this.id       = _.get(device, 'id', 1);
  this.interval = _.get(device, 'interval', 2000);
  this.logger   = require('./logger').getLogger('lib:modbusDevice-' + this.id);
  this.client   = new ModbusRTU();
  this.client.setID(this.id);

  this.collectors        = [];
  this.collectionEnabled = false;

  this.elements = [];
  let self      = this;
  let elements  = _.get(device, 'elements', []);
  elements.forEach(e => {
    let me = new ModbusElement(self.client, e);
    if (me) {
      me.on('changed', obj => {
        self.emit('changed', obj);
      });
      self.collectors.push(me.collector);
      this.elements.push(me);
    }
  });
}

util.inherits(ModbusDevice, EventEmitter);

/**
 * Connect to the server
 * @param callback
 */
ModbusDevice.prototype.connect = function (callback) {
  let self = this;
  self.client.connectTCP(self.url, {port: self.port}, (err) => {
    if (err) {
      self.logger.error(err);
      return callback(err);
    }
    self.emit('connected', self);
    // Just after connecting, collect data immediately
    self.periodicCollection();
    callback();
  });
};

/**
 * Disconnect from the server
 * @param callback
 */
ModbusDevice.prototype.disconnect = function (callback) {
  let self = this;
  if (self.client.isOpen) {
    self.client.close(err => {
      self.emit('disconnected', err);
    });
  }
};

/**
 * Collects all data
 * @param callback
 */
ModbusDevice.prototype.collect = function (callback) {
  let self = this;
  if (!self.client.isOpen) {
    self.emit('disconnected');
    return callback(new Error('Client is disconnected'));
  }

  if (!self.collectionEnabled) {
    // If the collection is disabled, just do nothing
    return callback();
  }
  async.waterfall(self.collectors, callback);
};

/**
 * Periodic collection: start interval for collection
 */
ModbusDevice.prototype.periodicCollection = function () {
  let self = this;

  self.collect(err => {
    if (err) {
      self.logger.error('Collection error', err);
    }
    if (self.client.isOpen) {
      _.delay(self.periodicCollection.bind(self), self.interval);
    }
    else {
      self.logger.info('NO PERiODIC COLLECTION!');
    }
  });
};

/**
 * Enabling / disabling collection
 * @param enabled
 */
ModbusDevice.prototype.enableCollection = function (enabled) {
  if (enabled != this.collectionEnabled) {
    this.logger.info(`Changing auto collection from ${this.collectionEnabled} to ${enabled}`);
  }
  this.collectionEnabled = enabled;
};

/**
 * Get the current data of the device
 * @returns {{url: *, port: *, id: *, interval: *, elements: Array}}
 */
ModbusDevice.prototype.getData = function () {
  let retVal = {
    url     : this.url,
    port    : this.port,
    id      : this.id,
    interval: this.interval,
    elements: []
  };
  this.elements.forEach(e => {
    retVal.elements.push(e.getObject());
  });
  return retVal;
};

module.exports = ModbusDevice;