function init() {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  els.pdfInput.addEventListener("change", handlePdfSelect);
  els.imageInput.addEventListener("change", handleImageSelect);
  els.searchInput.addEventListener("input", renderQuestionList);
  els.applyEditBtn.addEventListener("click", applyEditorChanges);
  els.kindInput.addEventListener("change", handleQuestionKindChange);
  els.cropImageBtn.addEventListener("click", openCropEditor);
  els.closeCropBtn.addEventListener("click", closeCropEditor);
  els.cancelCropBtn.addEventListener("click", closeCropEditor);
  els.saveCropBtn.addEventListener("click", saveCropEditor);
  els.removeQuestionImageBtn.addEventListener("click", removeQuestionImage);
  els.cropSelection.addEventListener("pointerdown", startCropInteraction);
  window.addEventListener("pointermove", moveCropInteraction);
  window.addEventListener("pointerup", endCropInteraction);
  els.cropModal.addEventListener("click", (event) => {
    if (event.target === els.cropModal) closeCropEditor();
  });
  els.footerInput.addEventListener("input", handleFooterChange);
  els.resetFooterBtn.addEventListener("click", resetFooterName);
  els.exportNameInput.addEventListener("input", handleExportNameChange);
  els.subjectCodeInput.addEventListener("input", handleSubjectCodeChange);
  els.fontScaleInput.addEventListener("input", handleQuestionFontScaleChange);
  els.fontScaleNumberInput.addEventListener("change", handleQuestionFontScaleChange);
  els.resetFontScaleBtn.addEventListener("click", resetQuestionFontScale);
  els.importAnswerModeInput.addEventListener("change", handleImportAnswerModeChange);
  els.answerControlsInput.addEventListener("change", handleAnswerControlsChange);
  els.pdfEngineInput.addEventListener("change", handlePdfEngineChange);
  els.imageEngineInput.addEventListener("change", handleImageEngineChange);
  els.saveGeminiBtn.addEventListener("click", saveGeminiSettings);
  els.loadGeminiModelsBtn.addEventListener("click", loadGeminiModelsFromApi);
  els.addQuestionBtn.addEventListener("click", addManualQuestion);
  els.deleteQuestionBtn.addEventListener("click", deleteCurrentQuestion);
  els.clearQuestionsBtn.addEventListener("click", clearAllQuestions);
  els.exportPngBtn.addEventListener("click", () => exportCurrentImage("png"));
  els.exportJpgBtn.addEventListener("click", () => exportCurrentImage("jpeg"));
  els.exportTextBtn.addEventListener("click", exportAllText);
  els.exportZipBtn.addEventListener("click", exportAllImagesZip);
  els.exportPdfBtn.addEventListener("click", exportAllPdf);

  syncGeminiInputs();
  applyQuestionFontScale(state.questionFontScale, { persist: false });
  render();
  refreshIcons();
  loadGeminiEnvConfig();
}


document.addEventListener("DOMContentLoaded", init);
