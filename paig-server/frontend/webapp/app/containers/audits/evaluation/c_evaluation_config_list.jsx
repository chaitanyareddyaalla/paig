import React, {Component, createRef} from 'react';
import {inject, observer} from 'mobx-react';
import {action} from 'mobx';

import {Grid} from '@material-ui/core';

import BaseContainer from 'containers/base_container';
import UiState from 'data/ui_state';
import f from 'common-ui/utils/f';
import {Utils} from 'common-ui/utils/utils';
import {AddButton} from 'common-ui/components/action_buttons';
import {IncludeExcludeComponent} from 'common-ui/components/v_search_component';
import VEvaluationConfigTable from 'components/audits/evaluation/v_evaluation_configs_list';
import FSModal from 'common-ui/lib/fs_modal';
import {createFSForm} from 'common-ui/lib/form/fs_form';
import VRunReportForm from 'components/audits/evaluation/v_run_report_form';
import {evaluation_form_def} from 'components/audits/evaluation/v_evaluation_details_form';

const CATEGORIES = {
  Name: { multi: false, category: "Name", type: "text", key: 'name' },
  EvaluationPurpose: { multi: false, category: "EvaluationPurpose", type: "text", key: 'purpose' },
  ApplicationName: { multi: false, category: "ApplicationName", type: "text", key: 'application_names' }
}

@inject('evaluationStore')
@observer
class CEvaluationConfigList extends Component {
  runReportModalRef = createRef();
  _vState = {
    searchFilterValue: [],
    showNextPage: null,
    prevNextValueList:[''],
    pageNumber: 0,
  }
  constructor(props) {
    super(props);

    this.evalForm = createFSForm(evaluation_form_def);
    this.dateRangeDetail = {
      daterange: Utils.dateUtil.getLast7DaysRange(),
      chosenLabel: 'Last 7 Days'
    }

    this.cEvalConfigs = f.initCollection();
    this.cEvalConfigs.params = {
      size: 120,
      sort: 'create_time,desc'
    }

    this.applicationKeyMap = {};

    this.restoreState();
  }
  componentDidMount() {
    this.handleRefresh();
  }
  componentWillUnmount() {
    let {dateRangeDetail, _vState} = this;
    let {params} = this.cEvalConfigs;
    let {vName} = this.props;
    let data = JSON.stringify({params, dateRangeDetail, _vState});
    UiState.saveState(vName, data);
  }
  @action
  restoreState() {
      let data = UiState.getStateData(this.props.vName)
      if (!data) {
        return;
      }
      if (data.dateRangeDetail.daterange.length) {
          data.dateRangeDetail.daterange[0] = Utils.dateUtil.getMomentObject(data.dateRangeDetail.daterange[0]);
          data.dateRangeDetail.daterange[1] = Utils.dateUtil.getMomentObject(data.dateRangeDetail.daterange[1]);
      }
      Object.assign(this, {
        dateRangeDetail: data.dateRangeDetail,
        _vState: data._vState
      });
      this.cEvalConfigs.params = data.params;
  }
  handleRefresh = () => {
    this.fetchEvaluationConfigs();
  }
  fetchEvaluationConfigs = () => {
    f.beforeCollectionFetch(this.cEvalConfigs);
    this.props.evaluationStore.fetchEvaluationConfigs({
      params: this.cEvalConfigs.params
    }).then(res => {
      f.resetCollection(this.cEvalConfigs, res.models, res.pageState);            
    },  f.handleError(this.cEvalConfigs));
  }

  handlePageChange = () => {
    this.fetchEvaluationConfigs();
  }
  handleDateChange = (event, picker) => {
    this._vState.prevNextValueList = [''];
    this._vState.pageNumber = 0;
    delete this.cEvalConfigs.params.page;
    if (picker.startDate) {
      this.cEvalConfigs.params.fromTime = picker.startDate.valueOf();
      this.cEvalConfigs.params.toTime = picker.endDate.valueOf();

      this.dateRangeDetail.daterange = [picker.startDate, picker.endDate];
    } else {
      delete this.cEvalConfigs.params.fromTime;
      delete this.cEvalConfigs.params.toTime;
      this.dateRangeDetail.daterange = [];
    }
    this.dateRangeDetail.chosenLabel = picker.chosenLabel;

    this.fetchEvaluationConfigs();
  }
  handleSearchByField = (filter, event) => {
    this._vState.prevNextValueList = [''];
    this._vState.pageNumber = 0;
    let params = {
      page: undefined
    };
    Object.values(CATEGORIES).forEach(obj => {
      params['includeQuery.' + obj.key] = undefined;
      params['excludeQuery.' + obj.key] = undefined;
    })

    filter.forEach((item) => {
      let obj = CATEGORIES[item.category];
      let prefix = item.operator == 'is' ? 'includeQuery' : 'excludeQuery';
      let value = item.value;
      if (obj) {
        if (obj.category && ['User', 'Application'].includes(obj.category)) {
          if (!value.startsWith('*')) {
            value = `*${value}`;
          }
          if (!value.endsWith('*')) {
            value = `${value}*`;
          }
        }
        if (obj.key === 'result') {
          value = value.toLowerCase();
        }       
        params[`${prefix}.${obj.key}`] = value;
      }        
    });
    Object.assign(this.cEvalConfigs.params, params);

    this._vState.searchFilterValue = filter;
    this.fetchEvaluationConfigs();
  }

  handleDelete = (model) => {
    f._confirm.show({
      title: `Delete Config`,
      children: <div>Are you sure you want to delete config ?</div>,
      btnCancelText: 'Cancel',
      btnOkText: 'Delete',
      btnOkColor: 'secondary',
      btnOkVariant: 'text'
    })
    .then((confirm) => {
      this.props.evaluationStore.deleteEvalConfig(model.id,{
        models: this.cEvalConfigs
      })
      .then(() => {
        confirm.hide();
        f.notifySuccess('Config Deleted');
        this.fetchEvaluationConfigs();
      }, f.handleError(null, null, {confirm}));
    }, () => {});
  }

  handleEdit = (model) => {
    console.log(model);
  };

  handleRun = (model) => {
    this.evalForm.clearForm();
    this.evalForm.refresh(model);
    this.evalForm.model = model;
    if (this.runReportModalRef.current) {
      this.runReportModalRef.current.show({
        title: 'Run Report',
        btnOkText: 'Run',
        btnCancelText: 'Cancel'
      })
    }
  }

  handlePostCreate = () => {
    this.props.history.replace('/eval_reports');
  }

  handleAddNew = () => {
    this.props.history.push('/eval/create');
  }

  handleRunSave = async () => {
    const form = this.evalForm;
    const formData = form.toJSON();
    const data = {
      id: formData.id,
      purpose: formData.purpose,
      name: formData.name,
      categories: JSON.parse(formData.categories || "[]"),
      custom_prompts: [],
      application_ids: formData.application_ids,
      report_name: formData.report_name
    };

    try {
      this._vState.saving = true;
      let response = await this.props.evaluationStore.evaluateConfig(data);
      this._vState.saving = false;
      this.runReportModalRef.current.hide();
      f.notifySuccess('Your evaluation is triggered successfully');
      this.handlePostCreate(response);
      this._vState.saving = false;
    } catch(e) {
      this._vState.saving = false;
      f.handleError()(e);
    }
  }

  render() {
    const {_vState} = this;
    return (
      <BaseContainer
        handleRefresh={this.handleRefresh}
        titleColAttr={{ lg: 12, md: 12 }}
      >
        <>
          <Grid container spacing={3}>
            <Grid item xs={6} sm={6} md={6} lg={6}>
              <IncludeExcludeComponent
                _vState={_vState}
                categoriesOptions={Object.values(CATEGORIES)}
                onChange={this.handleSearchByField}
              />
            </Grid>
            <Grid item xs={6} sm={6} md={6} lg={6}>
            <AddButton
              data-track-id="add-new-eval"
              colAttr={{
                xs: 12,
                sm: 12,
                md: 12
              }}
              label="Add New"
              onClick={this.handleAddNew}
            />
            </Grid>
          </Grid>
          <VEvaluationConfigTable
            data={this.cEvalConfigs}
            pageChange={this.handlePageChange}
            _vState={_vState}
            applicationKeyMap={this.applicationKeyMap}
            handleDelete={this.handleDelete}
            handleEdit={this.handleEdit}
            handleRun={this.handleRun}
          />
          <FSModal ref={this.runReportModalRef} dataResolve={this.handleRunSave}>
            <VRunReportForm form={this.evalForm} mode="run_report"/>
          </FSModal>
        </>
      </BaseContainer>
    );
  }
}

CEvaluationConfigList.defaultProps = {
  vName: 'evaluationConfigLists'
}

export default CEvaluationConfigList;