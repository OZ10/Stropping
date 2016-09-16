package com.adapters;

import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Paint;
import android.support.design.widget.Snackbar;
import android.support.v7.app.AlertDialog;
import android.text.InputType;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.NumberPicker;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;
import com.classes.QuantityItem;
import com.classes.ShoppingListItem;
import com.oz10.stropping.IngredientEditActivity;
import com.oz10.stropping.R;

import java.util.ArrayList;
import java.util.List;

/**
 * Created by Austen on 27/08/2016.
 */
public class IngredientListAdapter extends BaseAdapter {

    public ArrayList<QuantityItem> _ingredientsList = new ArrayList<>();
    public ArrayList<Ingredient> _selectedIngredientsList = new ArrayList<>();
    private int _layoutResource;
    private LayoutInflater _layoutInflater;
    private Context _parentContent;

    public IngredientListAdapter(Context context, List objects, int layoutResource) {

        _ingredientsList = (ArrayList<QuantityItem>) objects;
        _layoutResource = layoutResource;
        _layoutInflater = LayoutInflater.from(context);
        _parentContent = context;
    }

    @Override
    public int getCount() {
        return _ingredientsList.size();
    }

    @Override
    public long getItemId(int i) {
        return i;
    }

    @Override
    public QuantityItem getItem(int i) {
        return _ingredientsList.get(i);
    }

    public boolean add(Ingredient ingredient, boolean checkAlreadyAdded)
    {
        if (checkAlreadyAdded){
            for (QuantityItem i: _ingredientsList
                    ) {
                if (i.getName().equals(ingredient.getName())){
                    // already added to list
                    return false;
                }

            }
        }

        _ingredientsList.add(ingredient);
        return true;
    }

    @Override
    public View getView(int position, View convertView, final ViewGroup parent) {

        View view = convertView;

        // inflate
        if (view == null){
            view = _layoutInflater.inflate(_layoutResource, null);
        }

        // get ingredient
        final QuantityItem ingredient = _ingredientsList.get(position);

        // set default views (common across all layouts)
        if (ingredient != null) {
            SetIngredientName(view, ingredient.getName(), ingredient.getId(), parent);
            SetIngredientQuantity(view, ingredient, parent);

            switch (_layoutResource){
                case R.layout.item_shoppinglist:
                    break;
                case R.layout.item_ingredient:
                    SetIngredientIsSelected(view, (Ingredient)ingredient);
                    break;

                case R.layout.item_recipe_ingredient:
                    SetIngredientDeleteButton(view, (Ingredient)ingredient);
                    break;
            }
        }

        return view;
    }

    private void SetIngredientName(View view, final String ingredientName, final Long ingredientId, final ViewGroup parent)
    {
        final TextView textView = (TextView) view.findViewById(R.id.ingredient_name);
        textView.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            switch (_layoutResource){
                                                case R.layout.item_shoppinglist:
                                                    //TODO Refactor this. Must be better way to do this
                                                    int i = textView.getPaintFlags();
                                                    if (i == 1281){
                                                        textView.setPaintFlags(textView.getPaintFlags() | Paint.STRIKE_THRU_TEXT_FLAG);
                                                    }else{
                                                        textView.setPaintFlags(textView.getPaintFlags() & (~ Paint.STRIKE_THRU_TEXT_FLAG));
                                                    }

                                                    break;
                                                case R.layout.item_ingredient:
                                                    Intent intent = new Intent(_parentContent, IngredientEditActivity.class);
                                                    intent.putExtra("IngredientId", ingredientId);
                                                    _parentContent.startActivity(intent);
                                                    break;
                                                case R.layout.item_recipe_ingredient:
                                                    break;
                                            }
                                        }
                                    }
        );
        textView.setText(ingredientName);
    }

    private void SetIngredientQuantity(View view, final QuantityItem ingredient, final ViewGroup parent)
    {
        final TextView textView = (TextView) view.findViewById(R.id.ingredient_quantity);
        textView.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            //TODO Open Edit ingredient activity
//                                            Snackbar snackbar = Snackbar.make(parent, ingredientQuantity + " required!", Snackbar.LENGTH_SHORT);
//                                            snackbar.show();

                                            final FrameLayout parent = SetupDialogView(ingredient);

                                            AlertDialog.Builder builder = new AlertDialog.Builder(_parentContent);
                                            builder.setTitle(R.string.dialog_set_quantity);
                                            builder.setView(parent);

                                            builder.setPositiveButton("ok", new DialogInterface.OnClickListener(){

                                                @Override
                                                public void onClick(DialogInterface dialogInterface, int i) {
                                                    int quantity = getSelectedValue(ingredient, parent); // picker.getValue();
                                                    ingredient.setQuantity(quantity);
                                                    textView.setText(ingredient.getQuantityText());

                                                    StroppingDatabase db = StroppingDatabase.getInstance(_parentContent);

                                                    switch (_layoutResource){
                                                        case R.layout.item_shoppinglist:
                                                            db.updateShoppingListItem((ShoppingListItem) ingredient);
                                                            break;
                                                        case R.layout.item_ingredient:
                                                            db.updateIngredient((Ingredient)ingredient);
                                                            break;
                                                        case R.layout.item_recipe_ingredient:
                                                            break;
                                                    }
                                                }
                                            });

                                            Dialog dialog = builder.create();
                                            dialog.show();
                                        }
                                    }
        );
        textView.setText(ingredient.getQuantityText());
    }

    private FrameLayout SetupDialogView(QuantityItem ingredient){
        final FrameLayout parent = new FrameLayout(_parentContent);

        int currentValue = ingredient.getQuantity();

        if (ingredient.getUOM().equals("number of")){
            int minValue = 1; //currentValue < 21 ? 1 : currentValue - 20;
            int maxValue = currentValue + 50;

            final NumberPicker picker = new NumberPicker(_parentContent);
            //picker.setMinimumWidth(3000);
            picker.setId(R.id.quantityvalue);
            picker.setMinValue(minValue);
            picker.setMaxValue(maxValue);
            picker.setValue(currentValue);

            parent.addView(picker, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER));
        }else{
            EditText editText = new EditText(_parentContent);
            editText.setId(R.id.quantityvalue);
            editText.setText(String.valueOf(currentValue));
            editText.setInputType(InputType.TYPE_CLASS_NUMBER);

            TextView textView = new TextView(_parentContent);
            textView.setText(ingredient.getUOM());

            LinearLayout linearLayout = new LinearLayout(_parentContent);
            linearLayout.setOrientation(LinearLayout.HORIZONTAL);
            linearLayout.addView(editText);
            linearLayout.addView(textView);

            parent.addView(linearLayout, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER));

        }
        return parent;
    }

    private int getSelectedValue(QuantityItem ingredient, FrameLayout frameLayout){
        if (ingredient.getUOM().equals("number of")) {
            NumberPicker numberPicker = (NumberPicker) frameLayout.findViewById(R.id.quantityvalue);
            return numberPicker.getValue();
        }else{
            EditText editText = (EditText) frameLayout.findViewById(R.id.quantityvalue);
            return Integer.valueOf(editText.getText().toString());
        }
    }

    private void SetIngredientIsSelected(View view, final Ingredient ingredient)
    {
        CheckBox checkBox = (CheckBox) view.findViewById(R.id.ingredient_isselected);
        checkBox.setOnClickListener(new View.OnClickListener(){
                                        @Override
                                        public void onClick(View view) {
                                            CheckBox checkBox = (CheckBox) view; // view.findViewById(R.id.ingredient_isselected);
                                            ingredient.setIsSelected(checkBox.isChecked());

                                            if (ingredient.getIsSelected()){
                                                _selectedIngredientsList.add(ingredient);
                                            }else{
                                                _selectedIngredientsList.remove(ingredient);
                                            }
                                        }
                                    }
        );
        checkBox.setChecked(ingredient.getIsSelected());
    }

    private void SetIngredientDeleteButton(View view, final Ingredient ingredient)
    {
        Button button = (Button) view.findViewById(R.id.ingredient_delete);
        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                _ingredientsList.remove(ingredient);

                notifyDataSetChanged();
            }
        });
    }

    public void updateAdapterFromDatabase(Context context)
    {
        StroppingDatabase db = StroppingDatabase.getInstance(_parentContent);

        this._ingredientsList.clear();

        switch (_layoutResource){
            case R.layout.item_shoppinglist:
                ArrayList<ShoppingListItem> shoppingListItems = db.getAllShoppingListItems();
                for (ShoppingListItem shoppingListItem:shoppingListItems
                        ) {
                    _ingredientsList.add(shoppingListItem);
                }
                break;
            case R.layout.item_ingredient:
                ArrayList<Ingredient> ingredientListItems = db.getAllIngredients();
                for (Ingredient ingredientListItem:ingredientListItems
                        ) {
                    _ingredientsList.add(ingredientListItem);
                }
                break;
            case R.layout.item_recipe_ingredient:
                //ArrayList<ShoppingListItem> shoppingListItems1 = db.get
                break;
        }

        notifyDataSetChanged();

        //db.close();

    }

}
